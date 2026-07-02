import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const FROM = process.env.URANEKO_FROM_EMAIL!;
const ses = new SESClient({});

export async function sendDownloadEmail(params: {
  to: string;
  productTitle: string;
  orderId: string;
  downloadPageUrl: string;
}): Promise<void> {
  const { to, productTitle, orderId, downloadPageUrl } = params;

  const subject = `[uraneko] 受け渡し — ${productTitle}`;
  const textBody = [
    `${productTitle} の受け渡しリンク:`,
    ``,
    downloadPageUrl,
    ``,
    `※ このリンクは購入者専用。共有不可。`,
    `※ 注文番号: ${orderId}`,
    ``,
    `---`,
    `uraneko — private archive`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
      <h2 style="color:#222">${escapeHtml(productTitle)} — 受け渡し</h2>
      <p>以下のリンクから取得できます:</p>
      <p><a href="${escapeAttr(downloadPageUrl)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">ダウンロード</a></p>
      <p style="color:#555">※ このリンクは購入者専用。共有不可。</p>
      <p style="color:#888;font-size:12px">注文番号: ${escapeHtml(orderId)}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:30px 0" />
      <p style="color:#888;font-size:12px">uraneko — private archive</p>
    </div>
  `;

  await ses.send(
    new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: textBody, Charset: 'UTF-8' },
          Html: { Data: htmlBody, Charset: 'UTF-8' },
        },
      },
    }),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
