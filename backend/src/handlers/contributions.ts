import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamo';
import { ok, serverError } from '../lib/response';

const CACHE_TABLE = process.env.CACHE_TABLE!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_USER = process.env.GITHUB_USER || 'kuronekorou39';
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
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: GITHUB_USER } }),
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
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
