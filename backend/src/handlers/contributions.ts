import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { docClient } from '../lib/dynamo';
import { ok, serverError } from '../lib/response';

const CACHE_TABLE = process.env.CACHE_TABLE!;
// PAT は env に平文で置かず、シークレット名だけを受けて実行時に取得する
// (lib/uraneko/nowpayments.ts と同方式)。モジュールスコープにキャッシュして使い回す。
const GITHUB_TOKEN_SECRET = process.env.GITHUB_TOKEN_SECRET!;
const GITHUB_USER = process.env.GITHUB_USER || 'kuronekorou39';

const secretsClient = new SecretsManagerClient({});
let cachedGithubToken: string | undefined;
async function getGithubToken(): Promise<string> {
  if (!cachedGithubToken) {
    const res = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: GITHUB_TOKEN_SECRET }),
    );
    cachedGithubToken = res.SecretString ?? '';
  }
  return cachedGithubToken;
}
const CACHE_KEY = { pk: 'CACHE#contributions', sk: GITHUB_USER };
const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            color
          }
        }
      }
    }
  }
}`;

interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

interface CalendarData {
  totalContributions: number;
  weeks: { contributionDays: ContributionDay[] }[];
}

async function fetchFromGitHub(): Promise<CalendarData> {
  const githubToken = await getGithubToken();
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: GITHUB_USER } }),
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = (await res.json()) as {
    data: { user: { contributionsCollection: { contributionCalendar: CalendarData } } };
  };
  return json.data.user.contributionsCollection.contributionCalendar;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod !== 'GET') return ok({ error: 'Unsupported method' });

    // Check cache
    const cached = await docClient.send(
      new GetCommand({ TableName: CACHE_TABLE, Key: CACHE_KEY })
    );

    const now = Math.floor(Date.now() / 1000);
    if (cached.Item && (now - (cached.Item.fetchedAt as number)) < CACHE_TTL_SECONDS) {
      return ok(JSON.parse(cached.Item.data as string));
    }

    // Fetch fresh data
    const calendar = await fetchFromGitHub();

    // Save to cache
    await docClient.send(
      new PutCommand({
        TableName: CACHE_TABLE,
        Item: {
          ...CACHE_KEY,
          data: JSON.stringify(calendar),
          fetchedAt: now,
          ttl: now + CACHE_TTL_SECONDS * 2,
        },
      })
    );

    return ok(calendar);
  } catch (error) {
    console.error('Contributions handler error:', error);
    return serverError();
  }
}
