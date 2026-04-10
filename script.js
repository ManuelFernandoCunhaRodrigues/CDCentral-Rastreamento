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
const DESKTOP_NAV_BREAKPOINT = 980;
const fieldNodes = {
  nome: document.querySelector("#nome"),
  whatsapp: document.querySelector("#whatsapp"),
  tipo: document.querySelector("#tipo"),
  veiculos: document.querySelector("#veiculos"),
};
const fieldErrorNodes = {
  nome: document.querySelector("#error-nome"),
  whatsapp: document.querySelector("#error-whatsapp"),
  tipo: document.querySelector("#error-tipo"),
  veiculos: document.querySelector("#error-veiculos"),
};

const setHeaderState = () => {
  if (!header) {
    return;
  }
  header.classList.toggle("is-scrolled", window.scrollY > 10);
};

const closeMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
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
});

const validateLeadPayload = (payload) => {
  const errors = {};
  const digits = payload.whatsapp.replace(/\D/g, "");
  const vehiclesNumber = Number(payload.veiculos);

  if (payload.nome.length < 3) {
    errors.nome = "Informe seu nome completo.";
  }
  if (digits.length < 10 || digits.length > 11) {
    errors.whatsapp = "Informe um WhatsApp válido com DDD.";
  }
  if (!payload.tipo) {
    errors.tipo = "Selecione o tipo de atendimento.";
  }
  if (!Number.isFinite(vehiclesNumber) || vehiclesNumber < 1) {
    errors.veiculos = "Informe a quantidade de veículos.";
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

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if (startedAtInput) {
  startedAtInput.value = String(Date.now());
}

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((anchor) => {
    anchor.addEventListener("click", () => {
      closeMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= DESKTOP_NAV_BREAKPOINT) {
      closeMenu();
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

  const eventName = fieldNode.tagName === "SELECT" ? "change" : "input";
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
        entry.target.classList.add("is-visible");
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
  revealElements.forEach((node) => node.classList.add("is-visible"));
}

if (leadForm) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAllFieldErrors();

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
      submitButton.setAttribute("aria-busy", "true");
    }

    setFeedback("", "");

    const formData = new FormData(leadForm);
    const botField = String(formData.get("empresa") || "").trim();

    if (botField) {
      setFeedback("Não foi possível enviar. Tente novamente.", "error");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orçamento";
        submitButton.removeAttribute("aria-busy");
      }
      return;
    }

    const payload = getLeadPayload(formData);
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
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orçamento";
        submitButton.removeAttribute("aria-busy");
      }
      return;
    }

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Não foi possível enviar o formulário.");
      }

      setFeedback("Solicitação enviada com sucesso. Nossa equipe vai falar com você em breve.", "success");
      leadForm.reset();
      if (whatsappInput) {
        whatsappInput.value = "";
      }
      if (startedAtInput) {
        startedAtInput.value = String(Date.now());
      }
    } catch (error) {
      setFeedback(
        error.message || "Não foi possível enviar agora. Tente novamente em instantes.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Receber orçamento";
        submitButton.removeAttribute("aria-busy");
      }
    }
  });
}
