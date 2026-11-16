import { ImportDelimiter, ImportOperationMode } from '../src/types/uno.js';

export const MAX_IMPORT_FILE_BYTES = 512 * 1024; // 512 KB
export const MAX_IMPORT_RECORDS = 200;

export interface ParsedImportRow {
  lineNumber: number;
  username: string;
  displayName: string;
  password: string;
  columnCountMismatch?: boolean;
  parseError?: string;
}

export interface ParseImportResult {
  success: boolean;
  error?: string;
  ambiguousDelimiter?: boolean;
  candidateDelimiters?: ImportDelimiter[];
  detectedDelimiter?: ImportDelimiter;
  hasHeader?: boolean;
  rows: ParsedImportRow[];
}

const CANDIDATE_DELIMITERS: ImportDelimiter[] = [';', ',', '\t'];

const USERNAME_ALIASES = new Set(['username', 'usuario', 'usuário', 'login', 'user']);
const DISPLAY_NAME_ALIASES = new Set([
  'displayname',
  'display_name',
  'display name',
  'nome',
  'name',
  'apelido',
  'nome_exibicao',
  'nomeexibicao',
]);
const PASSWORD_ALIASES = new Set(['password', 'senha', 'pass', 'pwd']);

function normalizeHeaderToken(token: string): string {
  return token
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

/**
 * Parses a single CSV/TSV line respecting RFC-4180 double quotes and escaped quotes ("").
 */
export function parseDelimitedLine(line: string, delimiter: ImportDelimiter): {
  fields: string[];
  unclosedQuote: boolean;
} {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' && current.length === 0) {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return { fields, unclosedQuote: inQuotes };
}

function detectDelimiter(
  nonEmptyLines: Array<{ lineNumber: number; text: string }>,
  mode: ImportOperationMode
): {
  delimiter?: ImportDelimiter;
  ambiguous?: boolean;
  candidates?: ImportDelimiter[];
  error?: string;
} {
  const sample = nonEmptyLines.slice(0, 15);
  const scores: Array<{
    delimiter: ImportDelimiter;
    headerCols: number;
    consistentRows: number;
    avgCols: number;
    hasHeaderKeyword: boolean;
  }> = [];

  for (const delim of CANDIDATE_DELIMITERS) {
    const parsedRows = sample.map((l) => parseDelimitedLine(l.text, delim).fields);
    const headerFields = parsedRows[0] || [];
    const headerCols = headerFields.length;

    if (headerCols < 2) continue;

    let consistentRows = 0;
    let totalCols = 0;
    for (const fields of parsedRows) {
      totalCols += fields.length;
      if (fields.length === headerCols) {
        consistentRows++;
      }
    }

    const hasHeaderKeyword = headerFields.some((f) => {
      const n = normalizeHeaderToken(f);
      return USERNAME_ALIASES.has(n) || DISPLAY_NAME_ALIASES.has(n) || PASSWORD_ALIASES.has(n);
    });

    scores.push({
      delimiter: delim,
      headerCols,
      consistentRows,
      avgCols: totalCols / parsedRows.length,
      hasHeaderKeyword,
    });
  }

  if (scores.length === 0) {
    // Allow single-column username list ONLY in enroll_existing mode
    if (mode === 'enroll_existing') {
      return { delimiter: ';' };
    }
    return {
      ambiguous: true,
      candidates: [';', ',', '\t'],
      error: 'Não foi possível identificar o delimitador das colunas. Selecione manualmente (; , ou TAB).',
    };
  }

  if (scores.length === 1) {
    return { delimiter: scores[0].delimiter };
  }

  // Sort by: hasHeaderKeyword -> consistentRows === sample.length -> headerCols >= 3 -> consistentRows
  scores.sort((a, b) => {
    if (a.hasHeaderKeyword !== b.hasHeaderKeyword) return a.hasHeaderKeyword ? -1 : 1;
    const aAllConsistent = a.consistentRows === sample.length ? 1 : 0;
    const bAllConsistent = b.consistentRows === sample.length ? 1 : 0;
    if (aAllConsistent !== bAllConsistent) return bAllConsistent - aAllConsistent;
    if (a.consistentRows !== b.consistentRows) return b.consistentRows - a.consistentRows;
    return b.headerCols - a.headerCols;
  });

  const best = scores[0];
  const second = scores[1];

  // If top two are genuinely tied (e.g. both consistent on single row or same consistency & keyword score)
  const isTied =
    best.hasHeaderKeyword === second.hasHeaderKeyword &&
    best.consistentRows === second.consistentRows &&
    best.headerCols === second.headerCols;

  if (isTied) {
    return {
      ambiguous: true,
      candidates: scores.map((s) => s.delimiter),
      error: 'Delimitador ambíguo detectado nos dados. Escolha explicitamente qual delimitador usar.',
    };
  }

  return { delimiter: best.delimiter };
}

export function parseImportPayload(params: {
  rawText: string;
  mode: ImportOperationMode;
  delimiter?: ImportDelimiter | 'auto';
}): ParseImportResult {
  const { rawText, mode, delimiter = 'auto' } = params;

  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return {
      success: false,
      error: 'Nenhum conteúdo CSV ou texto foi informado para importação.',
      rows: [],
    };
  }

  const byteSize = Buffer.byteLength(rawText, 'utf-8');
  if (byteSize > MAX_IMPORT_FILE_BYTES) {
    return {
      success: false,
      error: `O arquivo/texto excede o limite máximo permitido de ${MAX_IMPORT_FILE_BYTES / 1024} KB (${Math.round(byteSize / 1024)} KB enviados).`,
      rows: [],
    };
  }

  // Strip UTF-8 BOM and normalize line endings
  const cleanText = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = cleanText.split('\n');

  const nonEmptyLines: Array<{ lineNumber: number; text: string }> = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim().length > 0) {
      nonEmptyLines.push({ lineNumber: i + 1, text: rawLines[i] });
    }
  }

  if (nonEmptyLines.length === 0) {
    return {
      success: false,
      error: 'Nenhuma linha válida encontrada no conteúdo enviado.',
      rows: [],
    };
  }

  let chosenDelimiter: ImportDelimiter;
  if (delimiter === ';' || delimiter === ',' || delimiter === '\t') {
    chosenDelimiter = delimiter;
  } else {
    const detection = detectDelimiter(nonEmptyLines, mode);
    if (detection.ambiguous || !detection.delimiter) {
      return {
        success: false,
        ambiguousDelimiter: true,
        candidateDelimiters: detection.candidates || [';', ',', '\t'],
        error: detection.error || 'Delimitador ambíguo. Selecione manualmente.',
        rows: [],
      };
    }
    chosenDelimiter = detection.delimiter;
  }

  const firstParsed = parseDelimitedLine(nonEmptyLines[0].text, chosenDelimiter);
  if (firstParsed.unclosedQuote) {
    return {
      success: false,
      detectedDelimiter: chosenDelimiter,
      error: `Aspas duplas não fechadas na linha ${nonEmptyLines[0].lineNumber}.`,
      rows: [],
    };
  }

  const firstNormalized = firstParsed.fields.map(normalizeHeaderToken);
  const looksLikeHeader = firstNormalized.some(
    (tok) => USERNAME_ALIASES.has(tok) || DISPLAY_NAME_ALIASES.has(tok) || PASSWORD_ALIASES.has(tok)
  );

  let usernameIdx = -1;
  let displayNameIdx = -1;
  let passwordIdx = -1;
  let startIndex = 0;

  if (looksLikeHeader) {
    startIndex = 1;
    firstNormalized.forEach((tok, idx) => {
      if (USERNAME_ALIASES.has(tok) && usernameIdx === -1) usernameIdx = idx;
      else if (DISPLAY_NAME_ALIASES.has(tok) && displayNameIdx === -1) displayNameIdx = idx;
      else if (PASSWORD_ALIASES.has(tok) && passwordIdx === -1) passwordIdx = idx;
    });

    if (usernameIdx === -1) {
      return {
        success: false,
        detectedDelimiter: chosenDelimiter,
        error: 'Cabeçalho inválido: coluna "username" é obrigatória.',
        rows: [],
      };
    }

    if (mode !== 'enroll_existing') {
      if (displayNameIdx === -1 || passwordIdx === -1) {
        return {
          success: false,
          detectedDelimiter: chosenDelimiter,
          error: 'Cabeçalho inválido: as colunas "username", "displayName" e "password" são obrigatórias para criação de usuários.',
          rows: [],
        };
      }
    }
  } else {
    // Positional fallback when no header row is provided
    usernameIdx = 0;
    if (mode !== 'enroll_existing') {
      displayNameIdx = 1;
      passwordIdx = 2;
    } else if (firstParsed.fields.length >= 2) {
      displayNameIdx = 1;
    }
  }

  const dataLines = nonEmptyLines.slice(startIndex);
  if (dataLines.length === 0) {
    return {
      success: false,
      detectedDelimiter: chosenDelimiter,
      hasHeader: looksLikeHeader,
      error: 'O arquivo possui apenas o cabeçalho, sem linhas de jogadores para importar.',
      rows: [],
    };
  }

  if (dataLines.length > MAX_IMPORT_RECORDS) {
    return {
      success: false,
      detectedDelimiter: chosenDelimiter,
      hasHeader: looksLikeHeader,
      error: `Limite máximo excedido: o lote contém ${dataLines.length} registros, mas o máximo permitido por importação é ${MAX_IMPORT_RECORDS}.`,
      rows: [],
    };
  }

  const expectedMinCols = mode === 'enroll_existing' ? 1 : 3;
  const rows: ParsedImportRow[] = [];

  for (const line of dataLines) {
    const parsed = parseDelimitedLine(line.text, chosenDelimiter);
    if (parsed.unclosedQuote) {
      rows.push({
        lineNumber: line.lineNumber,
        username: '',
        displayName: '',
        password: '',
        columnCountMismatch: true,
        parseError: 'Aspas duplas não fechadas nesta linha.',
      });
      continue;
    }

    const fields = parsed.fields;
    if (fields.length < expectedMinCols) {
      rows.push({
        lineNumber: line.lineNumber,
        username: (fields[usernameIdx] ?? '').trim(),
        displayName: displayNameIdx >= 0 ? (fields[displayNameIdx] ?? '').trim() : '',
        password: passwordIdx >= 0 ? fields[passwordIdx] ?? '' : '',
        columnCountMismatch: true,
        parseError: `Quantidade insuficiente de colunas (${fields.length} encontrada(s), esperado mínimo ${expectedMinCols}).`,
      });
      continue;
    }

    rows.push({
      lineNumber: line.lineNumber,
      username: (fields[usernameIdx] ?? '').trim(),
      displayName: displayNameIdx >= 0 ? (fields[displayNameIdx] ?? '').trim() : '',
      password: passwordIdx >= 0 ? fields[passwordIdx] ?? '' : '',
    });
  }

  return {
    success: true,
    detectedDelimiter: chosenDelimiter,
    hasHeader: looksLikeHeader,
    rows,
  };
}

export function buildCsvTemplate(mode: ImportOperationMode): string {
  if (mode === 'enroll_existing') {
    return 'username\njogador01\njogador02\n';
  }
  return 'username;displayName;password\njogador01;João Silva;1234\njogador02;Maria Souza;5678\n';
}
