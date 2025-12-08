const OPTIONS = [
  { value: 1, label: "Never - I'm here for the loot" },
  { value: 2, label: "50/50 - I might if it seems like a fair fight" },
  { value: 3, label: "I'll engage but stop if they say friendly" },
  { value: 4, label: "Kill on sight" },
  { value: 5, label: "This is a PvP game - why are you asking? It's all about PvP" }
];

export function showPvPGateModal(): Promise<number> {
  return new Promise((resolve) => {
    const modal = document.getElementById('pvp-gate-modal');
    if (!modal) {
      console.error('PvP gate modal container not found');
      resolve(1);
      return;
    }

    let selectedValue: number | null = null;

    const optionsHtml = OPTIONS.map(opt => `
      <label class="pvp-gate-option">
        <input type="radio" name="pvp-gate" value="${opt.value}" />
        <span class="pvp-gate-option-text">${opt.label}</span>
      </label>
    `).join('');

    modal.innerHTML = `
      <div class="pvp-gate-overlay"></div>
      <div class="pvp-gate-content">
        <h2 class="pvp-gate-title">Quick Question</h2>
        <p class="pvp-gate-question">How likely are you to shoot on sight or third-party other players for fun?</p>
        <div class="pvp-gate-options">
          ${optionsHtml}
        </div>
        <button class="pvp-gate-submit" disabled>Continue</button>
      </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const submitBtn = modal.querySelector('.pvp-gate-submit') as HTMLButtonElement;
    const radios = modal.querySelectorAll('input[name="pvp-gate"]');

    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        selectedValue = parseInt((e.target as HTMLInputElement).value, 10);
        submitBtn.disabled = false;
      });
    });

    submitBtn.addEventListener('click', () => {
      if (selectedValue !== null) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        modal.innerHTML = '';
        resolve(selectedValue);
      }
    });
  });
}
