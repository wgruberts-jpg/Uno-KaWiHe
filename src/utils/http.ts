export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  isJson: boolean;
  error?: string;
}

export async function parseJsonSafe<T = any>(res: Response): Promise<SafeJsonResult<T>> {
  const status = res.status;
  let text = '';
  try {
    text = await res.text();
  } catch {
    return {
      ok: res.ok,
      status,
      data: null,
      isJson: false,
      error: 'Não foi possível ler a resposta do servidor.',
    };
  }

  if (!text || !text.trim()) {
    return {
      ok: res.ok,
      status,
      data: null,
      isJson: false,
      error:
        status >= 500
          ? `Servidor temporariamente indisponível (${status}).`
          : status === 401 || status === 403
          ? 'Sessão expirada ou sem permissão de administrador.'
          : 'Resposta vazia do servidor.',
    };
  }

  try {
    const parsed = JSON.parse(text) as T;
    const errMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as any).error === 'string'
        ? (parsed as any).error
        : undefined;
    return {
      ok: res.ok,
      status,
      data: parsed,
      isJson: true,
      error: errMsg,
    };
  } catch {
    return {
      ok: res.ok,
      status,
      data: null,
      isJson: false,
      error:
        status >= 500
          ? `Servidor temporariamente indisponível (${status}).`
          : status === 401 || status === 403
          ? 'Sessão expirada ou sem permissão de administrador.'
          : 'Resposta inválida do servidor (formato não JSON).',
    };
  }
}
