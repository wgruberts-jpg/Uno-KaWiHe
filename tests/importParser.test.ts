import { describe, it, expect } from 'vitest';
import {
  buildCsvTemplate,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_RECORDS,
  parseDelimitedLine,
  parseImportPayload,
} from '../server/importParser.js';

describe('Import Parser Tests', () => {
  it('parses RFC-4180 quoted fields and escaped quotes accurately', () => {
    const line = '"joao.silva";"João ""Craque""; Silva";1234';
    const res = parseDelimitedLine(line, ';');
    expect(res.unclosedQuote).toBe(false);
    expect(res.fields).toEqual(['joao.silva', 'João "Craque"; Silva', '1234']);
  });

  it('strips UTF-8 BOM, ignores blank lines, and keeps original line numbers', () => {
    const csv = '\uFEFFusername;displayName;password\n\njogador1;Jogador Um;1234\n\njogador2;Jogador Dois;5678\n';
    const res = parseImportPayload({ rawText: csv, mode: 'create_only' });
    expect(res.success).toBe(true);
    expect(res.detectedDelimiter).toBe(';');
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ lineNumber: 3, username: 'jogador1', displayName: 'Jogador Um' });
    expect(res.rows[1]).toMatchObject({ lineNumber: 5, username: 'jogador2', displayName: 'Jogador Dois' });
  });

  it('supports reordered columns by header name and comma/tab delimiters', () => {
    const csvComma = 'password,username,displayName\n9999,maria,Maria Clara\n';
    const resComma = parseImportPayload({ rawText: csvComma, mode: 'create_only' });
    expect(resComma.success).toBe(true);
    expect(resComma.detectedDelimiter).toBe(',');
    expect(resComma.rows[0]).toMatchObject({ username: 'maria', displayName: 'Maria Clara', password: '9999' });

    const tsv = 'username\tdisplayName\tpassword\npedro\tPedro Paz\tabcd\n';
    const resTab = parseImportPayload({ rawText: tsv, mode: 'create_only' });
    expect(resTab.success).toBe(true);
    expect(resTab.detectedDelimiter).toBe('\t');
    expect(resTab.rows[0]).toMatchObject({ username: 'pedro', displayName: 'Pedro Paz', password: 'abcd' });
  });

  it('detects ambiguous delimiters and allows explicit delimiter override', () => {
    const ambiguous = 'username;displayName,password\njogador1;João,1234\n';
    const autoRes = parseImportPayload({ rawText: ambiguous, mode: 'create_only', delimiter: 'auto' });
    expect(autoRes.success).toBe(false);
    expect(autoRes.ambiguousDelimiter).toBe(true);
    expect(autoRes.candidateDelimiters?.length).toBeGreaterThanOrEqual(2);

    const noHeaderAmbiguous = 'a;b;c,d,e\n1;2;3,4,5\n';
    const autoNoHeader = parseImportPayload({ rawText: noHeaderAmbiguous, mode: 'create_only', delimiter: 'auto' });
    expect(autoNoHeader.success).toBe(false);
    expect(autoNoHeader.ambiguousDelimiter).toBe(true);

    const explicitNoHeader = parseImportPayload({ rawText: noHeaderAmbiguous, mode: 'create_only', delimiter: ';' });
    expect(explicitNoHeader.success).toBe(true);
    expect(explicitNoHeader.detectedDelimiter).toBe(';');
    expect(explicitNoHeader.rows).toHaveLength(2);
    expect(explicitNoHeader.rows[1]).toMatchObject({ username: '1', displayName: '2', password: '3,4,5' });

    const validExplicit = parseImportPayload({
      rawText: 'username;displayName;password\njogador1;João, Jr;1234\n',
      mode: 'create_only',
      delimiter: ';',
    });
    expect(validExplicit.success).toBe(true);
    expect(validExplicit.detectedDelimiter).toBe(';');
    expect(validExplicit.rows[0]).toMatchObject({ username: 'jogador1', displayName: 'João, Jr', password: '1234' });
  });

  it('rejects payloads exceeding 512 KB or 200 data records', () => {
    const oversized = 'a'.repeat(MAX_IMPORT_FILE_BYTES + 10);
    const sizeRes = parseImportPayload({ rawText: oversized, mode: 'create_only' });
    expect(sizeRes.success).toBe(false);
    expect(sizeRes.error).toContain('512 KB');

    const lines = ['username;displayName;password'];
    for (let i = 1; i <= MAX_IMPORT_RECORDS + 1; i++) {
      lines.push(`user${i};User ${i};1234`);
    }
    const rowRes = parseImportPayload({ rawText: lines.join('\n'), mode: 'create_only' });
    expect(rowRes.success).toBe(false);
    expect(rowRes.error).toContain('200');
  });

  it('supports single-column username list in enroll_existing mode and builds templates', () => {
    const raw = 'username\nwill\nhenry\n';
    const res = parseImportPayload({ rawText: raw, mode: 'enroll_existing' });
    expect(res.success).toBe(true);
    expect(res.rows.map((r) => r.username)).toEqual(['will', 'henry']);

    expect(buildCsvTemplate('create_only')).toContain('username;displayName;password');
    expect(buildCsvTemplate('enroll_existing')).toContain('username\n');
  });
});
