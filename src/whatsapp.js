const DEFAULT_API_VERSION = "v24.0";

export function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;

  if (!token) {
    throw new Error("Missing WHATSAPP_TOKEN");
  }

  if (!phoneNumberId) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }

  return { token, phoneNumberId, apiVersion };
}

export async function sendWhatsAppMessage(payload) {
  const { token, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        ...payload
      })
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error?.message || response.statusText;
    throw new Error(`WhatsApp API error ${response.status}: ${message}`);
  }

  return body;
}

export function sendTextMessage(to, text) {
  return sendWhatsAppMessage({
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text
    }
  });
}

export function sendTemplateMessage({
  to,
  templateName,
  languageCode,
  bodyParameters = []
}) {
  return sendWhatsAppMessage({
    to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components: bodyParameters.length
        ? [
            {
              type: "body",
              parameters: bodyParameters.map((text) => ({
                type: "text",
                text
              }))
            }
          ]
        : undefined
    }
  });
}
