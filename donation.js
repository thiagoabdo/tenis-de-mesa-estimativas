const dialog = document.getElementById('pix-dialog');
const openButton = document.getElementById('pix-open');
const closeButton = document.getElementById('pix-close');
const copyButton = document.getElementById('pix-copy');
const status = document.getElementById('pix-status');

async function copyPixPayload(payload) {
  try {
    await navigator.clipboard.writeText(payload);
    return;
  } catch {
    const input = document.createElement('textarea');
    input.value = payload;
    input.readOnly = true;
    input.setAttribute('aria-hidden', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('O navegador não permitiu copiar o Pix.');
  }
}

async function configureDonationDialog() {
  try {
    const response = await fetch(new URL('./site-config.json', document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    const payload = config.donation?.pixPayload;
    if (!/^000201/.test(payload || '') || !/6304[0-9A-F]{4}$/.test(payload || '')) throw new Error('O código Pix não está configurado.');

    openButton.addEventListener('click', () => dialog.showModal());
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => openButton.focus());
    copyButton.addEventListener('click', async () => {
      try {
        await copyPixPayload(payload);
        status.textContent = 'Pix copia e cola copiado. Cole no app do seu banco e confira os dados antes de confirmar.';
      } catch {
        status.textContent = 'Não foi possível copiar. Tente novamente ou use o QR code em outro dispositivo.';
      }
    });
  } catch (error) {
    console.error(error);
    openButton.disabled = true;
    openButton.textContent = 'Pix indisponível';
  }
}

configureDonationDialog();
