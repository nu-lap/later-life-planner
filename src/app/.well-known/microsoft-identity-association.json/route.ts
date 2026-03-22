export async function GET(): Promise<Response> {
  return Response.json(
    {
      associatedApplications: [
        { applicationId: '1bad3129-83bf-4d79-8cac-1ab7410ea7ec' },
      ],
    },
    {
      headers: {
        // Allow Azure portal and similar validators to fetch reliably.
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}

export const runtime = 'nodejs';

