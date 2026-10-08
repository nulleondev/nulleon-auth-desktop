// Native errors are identifiers; never display decoded QR content in a toast.
const messages = {
  QR_NOT_FOUND:
    "Nenhum QR 2FA válido encontrado. Deixe o código inteiro visível ou importe a imagem.",
  QR_CAPTURE_FAILED:
    "Não foi possível capturar todas as telas. Verifique a permissão ou importe a imagem do QR.",
  QR_WAYLAND_UNSUPPORTED:
    "Nesta sessão Wayland, use Importar imagem do QR ou a chave manual. A captura atual não garante processamento sem arquivos temporários.",
  QR_MULTIPLE:
    "Há mais de um QR 2FA. Deixe apenas o desejado visível ou importe uma imagem com um único código.",
  QR_UNSUPPORTED_TYPE:
    "Este QR usa HOTP ou outro tipo não suportado. O app aceita TOTP.",
  QR_MIGRATION_UNSUPPORTED:
    "Este é um QR de exportação do Google Authenticator. Use o QR TOTP individual do serviço.",
  QR_UNSUPPORTED_PARAMETERS:
    "Parâmetros não suportados. Use SHA1, SHA256 ou SHA512, 6 ou 8 dígitos e período de 1 a 300 segundos.",
  QR_INVALID_SECRET: "A chave Base32 do QR é inválida ou incompleta.",
  QR_INVALID_URI: "O QR contém dados de configuração inválidos.",
  QR_ISSUER_MISMATCH:
    "Os nomes de emissor no QR não coincidem. Confira a origem do código.",
  QR_IMAGE_INVALID:
    "Use uma imagem PNG, JPEG ou WebP válida de até 10 MB e 8192 × 8192 pixels.",
  QR_BUSY: "Já há uma leitura de QR em andamento.",
  QR_WINDOW_FAILED:
    "Não foi possível preparar a janela para captura. Importe a imagem do QR.",
};
export function qrErrorMessage(error) {
  return (
    messages[String(error)] ||
    "Não foi possível ler o QR. Tente importar a imagem ou inserir a chave manualmente."
  );
}
