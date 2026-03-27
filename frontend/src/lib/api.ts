import type { Project, Review } from '../../../shared/src/types';

const BASE_URL = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json();
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Projects
export async function fetchProjects(): Promise<Project[]> {
  return request<Project[]>('/projects');
}

export async function fetchProject(id: string): Promise<Project> {
  return request<Project>(`/projects/${id}`);
}

// Reviews
export async function fetchReviews(projectId: string): Promise<Review[]> {
  return request<Review[]>(`/reviews/${projectId}`);
}

export async function createReview(
  projectId: string,
  data: { rating: number; content: string },
  token: string,
): Promise<Review> {
  return request<Review>(`/reviews/${projectId}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function updateReview(
  projectId: string,
  reviewId: string,
  data: { rating: number; content: string },
  token: string,
): Promise<void> {
  await request<void>(`/reviews/${projectId}/${reviewId}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function deleteReview(
  projectId: string,
  reviewId: string,
  token: string,
): Promise<void> {
  await request<void>(`/reviews/${projectId}/${reviewId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

// Downloads
export async function getDownloadUrl(projectId: string, token: string): Promise<string> {
  const data = await request<{ url: string }>(`/downloads/${projectId}`, {
    headers: authHeaders(token),
  });
  return data.url;
}

// Page Views
export async function incrementPageView(projectId: string): Promise<void> {
  await request<void>(`/page-views/${projectId}`, {
    method: 'POST',
  });
}

export async function fetchPageView(
  projectId: string,
): Promise<{ projectId: string; count: number }> {
  return request<{ projectId: string; count: number }>(
    `/page-views/${projectId}`,
  );
}
