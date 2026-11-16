import fs from 'fs';
import path from 'path';

/**
 * Controle centralizado de escrita atômica e exclusão mútua (in-process + file lock).
 * Garante que todas as operações que leem/gravam arquivos JSON em DATA_DIR
 * (cadastro público, cadastro administrativo, importação em massa, alteração de contas e torneios)
 * sejam serializadas sem sobrescrita simultânea dentro do processo Node.js e entre processos
 * compartilhando o mesmo diretório (ex: uno-game + kawihe-auth via volume ./data).
 */

let inProcessQueue: Promise<void> = Promise.resolve();

const STALE_LOCK_MS = 15_000;
const LOCK_RETRY_DELAY_MS = 15;
const LOCK_MAX_WAIT_MS = 10_000;

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  ensureDirExists(dir);
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeSync(fd, data, 0, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}

async function acquireAdvisoryFileLock(lockFilePath: string): Promise<() => void> {
  ensureDirExists(path.dirname(lockFilePath));
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;

  while (true) {
    try {
      const fd = fs.openSync(lockFilePath, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }), 0, 'utf-8');
      } finally {
        fs.closeSync(fd);
      }
      return () => {
        try {
          if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
          }
        } catch {
          // ignore cleanup failure
        }
      };
    } catch (err: any) {
      if (err?.code !== 'EEXIST') {
        throw err;
      }

      // Check stale lock left behind by a crashed process
      try {
        const stat = fs.statSync(lockFilePath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockFilePath);
          continue;
        }
      } catch {
        // Lock disappeared between EEXIST and stat; retry immediately
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error('Timeout aguardando lock de persistência em DATA_DIR.');
      }

      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
  }
}

/**
 * Serializa operações críticas de persistência em DATA_DIR:
 * 1. Mutex FIFO em memória (exclui concorrência entre requests assíncronas do mesmo processo).
 * 2. File lock exclusivo `data/.kawihe.lock` (protege contra processos paralelos no mesmo volume).
 */
export async function withDataLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = inProcessQueue;
  let releaseInProcess!: () => void;
  inProcessQueue = new Promise<void>((resolve) => {
    releaseInProcess = resolve;
  });

  await prev;

  const lockFilePath = path.join(getDataDir(), '.kawihe.lock');
  let releaseFileLock: (() => void) | null = null;
  try {
    releaseFileLock = await acquireAdvisoryFileLock(lockFilePath);
    return await fn();
  } finally {
    if (releaseFileLock) {
      releaseFileLock();
    }
    releaseInProcess();
  }
}
