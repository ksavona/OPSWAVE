export const dynamic = "force-dynamic";

export const GET = (): Response =>
  Response.json(
    {
      service: "opsweave-web",
      status: "ok",
      version: "0.0.0",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 200,
    },
  );
