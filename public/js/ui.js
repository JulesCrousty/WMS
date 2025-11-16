let toastContainer;
let modalOverlay;

export function initUI() {
  toastContainer = document.createElement("div");
  toastContainer.className = "toast-container";
  document.body.appendChild(toastContainer);
}

export function showToast(type, message) {
  if (!toastContainer) {
    initUI();
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.remove();
  }, 4000);
}

export function showModal(title, content, { onSubmit } = {}) {
  closeModal();
  modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
    <div class="modal">
      <header>
        <h2>${title}</h2>
        <button class="modal-close" aria-label="Fermer">×</button>
      </header>
      <div class="modal-body">${content}</div>
    </div>
  `;
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) {
      closeModal();
    }
  });
  modalOverlay.querySelector(".modal-close").addEventListener("click", closeModal);
  if (onSubmit) {
    const form = modalOverlay.querySelector("form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      onSubmit(new FormData(form));
    });
  }
  document.body.appendChild(modalOverlay);
}

export function closeModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
}

export function renderSkeletonCard(lines = 3) {
  return `
    <div class="skeleton-card">
      ${Array.from({ length: lines })
        .map(() => '<div class="skeleton skeleton-line"></div>')
        .join("")}
    </div>
  `;
}

export function applyTransition(element) {
  element.classList.remove("fade-in");
  void element.offsetWidth; // reset animation
  element.classList.add("fade-in");
}
