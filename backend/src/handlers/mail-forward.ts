// rou39.com 宛に届いた SES 受信メールを Gmail へ転送する Lambda。
//
// 流れ:
//   1. SES Receipt Rule が S3 に原文を保存し、 続けてこの Lambda を起動
//   2. event.Records[].ses.mail.messageId が S3 オブジェクトキー
//   3. mailparser で原文を解析し、 元の件名 / 本文 / 添付情報を抽出
//   4. SES SendRawEmail で
//        From:     forward@rou39.com (rou39.com domain identity 配下、 SES verified)
//        To:       FORWARD_TO (kuronekorou39@gmail.com、 sandbox でも verified)
//        Reply-To: 元の送信者
//      に組み立てて送信。 件名に元の宛先 (例: claude@rou39.com) を付けることで
//      Gmail 側でフィルタ・ラベリングしやすくする。
//
// 注意:
//   - SES Sandbox 中は送信先が verified identity でないと届かない。
//     Gmail (kuronekorou39@gmail.com) は既に verified 済み。
//   - SES Client は ap-northeast-1 を明示。 既存の rou39.com identity が東京で
//     verify されているため、 Lambda が us-east-1 でも送信は東京経由で行う。

import type { SESEvent } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';

const s3 = new S3Client({});
const ses = new SESClient({ region: 'ap-northeast-1' });

const FORWARD_TO  = process.env.FORWARD_TO!;
const FROM_ADDR   = process.env.FROM_ADDR!;
const MAIL_BUCKET = process.env.MAIL_BUCKET!;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function encodeHeader(s: string): string {
  // RFC 2047 (MIME encoded-word) で UTF-8 を Base64 エンコード
  return `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`;
}

export async function handler(event: SESEvent): Promise<void> {
  for (const record of event.Records) {
    const messageId = record.ses.mail.messageId;
    try {
      const obj = await s3.send(new GetObjectCommand({
        Bucket: MAIL_BUCKET,
        Key: messageId,
      }));
      const raw = await streamToBuffer(obj.Body as Readable);
      const parsed = await simpleParser(raw);

      const fromAddr = parsed.from?.value?.[0]?.address ?? 'unknown@unknown';
      const fromName = parsed.from?.value?.[0]?.name || fromAddr;
      const toText   = (Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text) || '';
      const subject  = parsed.subject || '(no subject)';

      // 元の宛先を件名先頭に付与 (Gmail のフィルタで [claude@rou39.com] 等を拾えるように)
      const newSubject = toText ? `[${toText}] ${subject}` : subject;

      // multipart/alternative で text と html の両方を入れる
      const text = parsed.text || '';
      const html = parsed.html || '';
      const boundary = `=_rou39_${messageId}`;

      const headerLines = [
        `From: ${encodeHeader(`rou39 forwarder (${fromName})`)} <${FROM_ADDR}>`,
        `To: ${FORWARD_TO}`,
        `Subject: ${encodeHeader(newSubject)}`,
        `Reply-To: ${fromAddr}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        `X-Original-From: ${fromAddr}`,
        `X-Original-To: ${toText}`,
      ];

      const bodyLines = [
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        text || '(plain text part is empty)',
        ``,
      ];

      if (html) {
        bodyLines.push(
          `--${boundary}`,
          `Content-Type: text/html; charset=UTF-8`,
          `Content-Transfer-Encoding: 8bit`,
          ``,
          html,
          ``,
        );
      }
      bodyLines.push(`--${boundary}--`, ``);

      const rawMessage = [...headerLines, ...bodyLines].join('\r\n');

      await ses.send(new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawMessage, 'utf-8') },
        Source: FROM_ADDR,
        Destinations: [FORWARD_TO],
      }));

      console.log(`Forwarded ${messageId} from=${fromAddr} to=${toText} subj="${subject}"`);
    } catch (err) {
      // 失敗してもスローして retry されると Gmail に重複が届くので、
      // 個別にログだけ残して次のレコードへ
      console.error(`Failed to forward messageId=${messageId}:`, err);
    }
  }
}
