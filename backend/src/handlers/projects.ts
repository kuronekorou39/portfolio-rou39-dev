import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, notFound, serverError } from '../lib/response';

const TABLE = process.env.PROJECTS_TABLE!;
const PAGE_VIEWS_TABLE = process.env.PAGE_VIEWS_TABLE!;

/**
 * 一覧に表示数・DL数を埋め込む。
 * フロントがアプリごとに /page-views を叩くと N+1 になるので、ここでまとめて取る。
 * BatchGetItem は 1 回 100 件までだが、プロジェクト数が当面それを超えることはない。
 * 件数はあくまで付加情報なので、取得に失敗しても 0 として一覧自体は返す。
 */
async function withCounts(items: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!items.length) return items;

  let counts = new Map<string, { count?: number; downloadCount?: number }>();
  try {
    const result = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [PAGE_VIEWS_TABLE]: {
            Keys: items.map((item) => ({ projectId: item.id })),
          },
        },
      })
    );
    counts = new Map(
      (result.Responses?.[PAGE_VIEWS_TABLE] ?? []).map((row) => [row.projectId as string, row])
    );
  } catch (error) {
    console.error('Failed to load page view counts:', error);
  }

  return items.map((item) => ({
    ...item,
    viewCount: counts.get(item.id as string)?.count ?? 0,
    downloadCount: counts.get(item.id as string)?.downloadCount ?? 0,
  }));
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const projectId = event.pathParameters?.id;

    if (projectId) {
      // GET /projects/{id}
      const result = await docClient.send(
        new GetCommand({ TableName: TABLE, Key: { id: projectId } })
      );
      if (!result.Item || result.Item.published !== true) return notFound('Project not found');
      return ok(result.Item);
    }

    // GET /projects
    const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
    const items = (result.Items ?? []).filter((item) => item.published === true);
    return ok(await withCounts(items));
  } catch (error) {
    console.error('Projects handler error:', error);
    return serverError();
  }
}
