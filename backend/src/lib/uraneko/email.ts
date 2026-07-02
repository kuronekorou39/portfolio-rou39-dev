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

  const subject = `[uraneko.rou39.com] ご購入ありがとうございます - ${productTitle}`;
  const textBody = [
    `${productTitle} のご購入ありがとうございます。`,
    ``,
    `以下のURLから動画をダウンロードできます:`,
    downloadPageUrl,
    ``,
    `※このURLはあなた専用です。他人と共有しないでください。`,
    `※注文番号: ${orderId}`,
    ``,
    `---`,
    `uraneko.rou39.com`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
      <h2 style="color:#222">${escapeHtml(productTitle)} のご購入ありがとうございます</h2>
      <p>以下のリンクから動画をダウンロードできます:</p>
      <p><a href="${escapeAttr(downloadPageUrl)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">動画をダウンロード</a></p>
      <p style="color:#b00">※このURLはあなた専用です。他人と共有しないでください。</p>
      <p style="color:#888;font-size:12px">注文番号: ${escapeHtml(orderId)}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:30px 0" />
      <p style="color:#888;font-size:12px">uraneko.rou39.com</p>
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
