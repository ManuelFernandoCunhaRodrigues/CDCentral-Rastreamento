document.documentElement.classList.add("reveal-ready");

const header = document.querySelector(".header");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const yearNode = document.querySelector("#current-year");
const revealElements = document.querySelectorAll("[data-reveal]");

const leadForm = document.querySelector("#lead-form");
const submitButton = document.querySelector("#lead-submit");
const feedbackNode = document.querySelector("#form-feedback");
const whatsappInput = document.querySelector("#whatsapp");
const startedAtInput = document.querySelector("#started_at");
const consentVersionInput = document.querySelector("#consent_version");
const keepHeaderScrolled = document.body.classList.contains("legal-page");

const DESKTOP_NAV_BREAKPOINT = 980;
const SUBMIT_TIMEOUT_MS = 10000;
const SUBMIT_IDLE_TEXT = "Receber orçamento";
const SUBMIT_LOADING_TEXT = "Enviando...";
const GENERIC_SUBMIT_ERROR = "Não foi possível enviar agora. Tente novamente em instantes.";
const FALLBACK_CONSENT_VERSION = "2026-04-28";
let activeConsentVersion = String(consentVersionInput?.value || "").trim() || FALLBACK_CONSENT_VERSION;
let publicConfigPromise = null;

const fieldNodes = {
  nome: document.querySelector("#nome"),
  whatsapp: document.querySelector("#whatsapp"),
  tipo: document.querySelector("#tipo"),
  veiculos: document.querySelector("#veiculos"),
  consent: document.querySelector("#consent"),
};

const fieldErrorNodes = {
  nome: document.querySelector("#error-nome"),
  whatsapp: document.querySelector("#error-whatsapp"),
  tipo: document.querySelector("#error-tipo"),
  veiculos: document.querySelector("#error-veiculos"),
  consent: document.querySelector("#error-consent"),
};

const fieldMessages = {
  nome: "Informe seu nome completo.",
  whatsapp: "Informe um WhatsApp válido com DDD.",
  tipo: "Selecione o tipo de atendimento.",
  veiculos: "Informe uma quantidade entre 1 e 9999 veículos.",
  consent: "Confirme a Política de Privacidade para continuar.",
};

const setHeaderState = () => {
  if (header) {
    header.classList.toggle("is-scrolled", keepHeaderScrolled || window.scrollY > 10);
  }
};

const revealElement = (node) => {
  node.classList.add("is-visible");
};

const revealVisibleElements = () => {
  if (revealElements.length === 0) {
    return;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  revealElements.forEach((node) => {
    if (node.classList.contains("is-visible")) {
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top <= viewportHeight * 0.92 && rect.bottom >= 0) {
      revealElement(node);
    }
  });
};

const closeMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Abrir menu");
};

const formatWhatsapp = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const getLeadPayload = (formData) => ({
  nome: String(formData.get("nome") || "").trim().replace(/\s+/g, " "),
  whatsapp: String(formData.get("whatsapp") || "").trim(),
  tipo: String(formData.get("tipo") || "").trim(),
  veiculos: String(formData.get("veiculos") || "").trim(),
  empresa: String(formData.get("empresa") || "").trim(),
  startedAt: String(formData.get("started_at") || "").trim(),
  consent: formData.get("consent") === "true",
  consentVersion: activeConsentVersion || String(formData.get("consentVersion") || "").trim(),
});

const validateLeadPayload = (payload) => {
  const errors = {};
  const digits = payload.whatsapp.replace(/\D/g, "");
  const vehiclesNumber = Number(payload.veiculos);

  if (payload.nome.length < 3) {
    errors.nome = fieldMessages.nome;
  }
  if (digits.length < 10 || digits.length > 11) {
    errors.whatsapp = fieldMessages.whatsapp;
  }
  if (!payload.tipo) {
    errors.tipo = fieldMessages.tipo;
  }
  if (!Number.isInteger(vehiclesNumber) || vehiclesNumber < 1 || vehiclesNumber > 9999) {
    errors.veiculos = fieldMessages.veiculos;
  }
  if (payload.consent !== true) {
    errors.consent = fieldMessages.consent;
  }

  return errors;
};

const setFieldError = (fieldName, message) => {
  const field = fieldNodes[fieldName];
  const errorNode = fieldErrorNodes[fieldName];

  if (field) {
    field.setAttribute("aria-invalid", "true");
  }

  if (errorNode) {
    errorNode.textContent = message;
  }
};

const clearFieldError = (fieldName) => {
  const field = fieldNodes[fieldName];
  const errorNode = fieldErrorNodes[fieldName];

  if (field) {
    field.removeAttribute("aria-invalid");
  }

  if (errorNode) {
    errorNode.textContent = "";
  }
};

const clearAllFieldErrors = () => {
  Object.keys(fieldNodes).forEach(clearFieldError);
};

const setFeedback = (message, status) => {
  if (!feedbackNode) {
    return;
  }

  feedbackNode.textContent = message;
  feedbackNode.classList.remove("is-success", "is-error");

  if (status === "success") {
    feedbackNode.classList.add("is-success");
  }

  if (status === "error") {
    feedbackNode.classList.add("is-error");
  }
};

const setSubmitLoading = (isLoading) => {
  if (!submitButton) {
    return;
  }

  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? SUBMIT_LOADING_TEXT : SUBMIT_IDLE_TEXT;

  if (isLoading) {
    submitButton.setAttribute("aria-busy", "true");
  } else {
    submitButton.removeAttribute("aria-busy");
  }
};

const resetStartedAt = () => {
  if (startedAtInput) {
    startedAtInput.value = String(Date.now());
  }
};

const getSubmitErrorMessage = (response) => {
  if (!response) {
    return GENERIC_SUBMIT_ERROR;
  }

  if (response.status === 413) {
    return "Os dados enviados ficaram grandes demais. Revise o formulário e tente novamente.";
  }

  if (response.status === 415) {
    return "Não foi possível processar o envio. Atualize a página e tente novamente.";
  }

  if (response.status === 422) {
    return "Revise os campos destacados e tente novamente.";
  }

  if (response.status === 429) {
    return "Muitas tentativas em sequência. Aguarde um instante e tente novamente.";
  }

  if (response.status >= 500) {
    return "Nao foi possivel concluir o envio agora. Tente novamente em instantes.";
  }

  return GENERIC_SUBMIT_ERROR;
};

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const loadPublicConfig = async () => {
  if (publicConfigPromise) {
    return publicConfigPromise;
  }

  publicConfigPromise = (async () => {
    const response = await fetchWithTimeout("/api/public-config", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const config = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error("public_config_unavailable");
    }

    const incomingVersion = String(config.consentVersion || "").trim();
    if (incomingVersion) {
      activeConsentVersion = incomingVersion;
      if (consentVersionInput) {
        consentVersionInput.value = activeConsentVersion;
      }
    }

    return config;
  })().catch((error) => {
    publicConfigPromise = null;
    throw error;
  });

  return publicConfigPromise;
};

const initializeFormConfig = async () => {
  try {
    await loadPublicConfig();
  } catch (error) {
    /* fallback consent version já está em activeConsentVersion */
  }
};

const applyServerFieldErrors = (fields) => {
  if (!Array.isArray(fields)) {
    return;
  }

  fields.forEach((fieldName) => {
    if (fieldMessages[fieldName]) {
      setFieldError(fieldName, fieldMessages[fieldName]);
    }
  });

  const firstInvalidField = fieldNodes[fields.find((fieldName) => fieldNodes[fieldName])];
  if (firstInvalidField) {
    firstInvalidField.focus();
  }
};

const handleLeadSubmit = async (event) => {
  event.preventDefault();
  clearAllFieldErrors();
  setFeedback("", "");

  const formData = new FormData(leadForm);
  const payload = getLeadPayload(formData);

  if (payload.empresa) {
    setFeedback(GENERIC_SUBMIT_ERROR, "error");
    return;
  }

  const validationErrors = validateLeadPayload(payload);

  if (Object.keys(validationErrors).length > 0) {
    Object.entries(validationErrors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });
    setFeedback("Revise os campos destacados e tente novamente.", "error");
    const firstInvalidField = fieldNodes[Object.keys(validationErrors)[0]];
    if (firstInvalidField) {
      firstInvalidField.focus();
    }
    return;
  }

  await initializeFormConfig();

  setSubmitLoading(true);

  try {
    const response = await fetchWithTimeout("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      applyServerFieldErrors(result.fields);
      const submitError = new Error(getSubmitErrorMessage(response));
      throw submitError;
    }

    setFeedback("Solicitação enviada com sucesso. Nossa equipe vai falar com você em breve.", "success");
    leadForm.reset();
    if (whatsappInput) {
      whatsappInput.value = "";
    }
    if (consentVersionInput) {
      consentVersionInput.value = activeConsentVersion;
    }
    resetStartedAt();
  } catch (error) {
    const isAbortError = error && error.name === "AbortError";
    setFeedback(
      isAbortError ? "O envio demorou mais que o esperado. Verifique sua conexão e tente novamente." : error.message || GENERIC_SUBMIT_ERROR,
      "error"
    );
  } finally {
    setSubmitLoading(false);
  }
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

resetStartedAt();

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  });

  nav.querySelectorAll("a").forEach((anchor) => {
    anchor.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= DESKTOP_NAV_BREAKPOINT) {
      closeMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu();
      menuToggle.focus();
    }
  });
}

if (whatsappInput) {
  whatsappInput.addEventListener("input", (event) => {
    event.target.value = formatWhatsapp(event.target.value);
    clearFieldError("whatsapp");
  });
}

Object.entries(fieldNodes).forEach(([fieldName, fieldNode]) => {
  if (!fieldNode || fieldName === "whatsapp") {
    return;
  }

  const eventName = fieldNode.tagName === "SELECT" || fieldNode.type === "checkbox" ? "change" : "input";
  fieldNode.addEventListener(eventName, () => {
    clearFieldError(fieldName);
  });
});

if ("IntersectionObserver" in window && revealElements.length > 0) {
  const observer = new IntersectionObserver(
    (entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        revealElement(entry.target);
        instance.unobserve(entry.target);
      });
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -30px 0px",
    }
  );
  revealElements.forEach((node) => observer.observe(node));
} else {
  revealElements.forEach(revealElement);
}

if (revealElements.length > 0) {
  window.addEventListener("scroll", revealVisibleElements, { passive: true });
  window.addEventListener("resize", revealVisibleElements);
  revealVisibleElements();
}

if (leadForm) {
  leadForm.addEventListener("submit", handleLeadSubmit);
  initializeFormConfig();
}
