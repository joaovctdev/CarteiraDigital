/**
 * Camada de comunicação com o backend (Google Apps Script).
 *
 * Observação técnica: o POST é enviado como texto puro (sem header
 * "Content-Type: application/json") de propósito — isso evita que o
 * navegador dispare uma requisição de "preflight" (OPTIONS), que o
 * Apps Script não sabe responder. O backend faz JSON.parse no conteúdo
 * mesmo assim.
 */
const API = (() => {
  function isConfigured() {
    // Basta checar se a URL existe e não está vazia
    return Boolean(CONFIG && CONFIG.API_URL && CONFIG.API_URL.trim() !== "");
  }

  async function get(action) {
    const url = `${CONFIG.API_URL}?action=${encodeURIComponent(action)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`Erro de rede (${res.status})`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro desconhecido");
    return json.data;
  }

  async function post(payload) {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Erro de rede (${res.status})`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro desconhecido");
    return json.data;
  }

  return {
    isConfigured,
    bootstrap: () => get("bootstrap"),
    listTransactions: () => get("list"),
    listDados: () => get("dados"),
    addTransaction: (data) => post({ action: "add", data }),
    addManyTransactions: (items) => post({ action: "addMany", items }),
    updateTransaction: (id, data) => post({ action: "update", id, data }),
    deleteTransaction: (id) => post({ action: "delete", id }),
    deleteGroup: (groupId) => post({ action: "deleteGroup", groupId }),
    setConfig: (data) => post({ action: "setConfig", data }),
    addRecorrente: (data) => post({ action: "addRecorrente", data }),
    updateRecorrente: (id, data) => post({ action: "updateRecorrente", id, data }),
    deleteRecorrente: (id) => post({ action: "deleteRecorrente", id }),
  };
})();
