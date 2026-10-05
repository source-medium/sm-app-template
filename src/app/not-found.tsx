import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        Go to the app
      </Link>
    </main>
  );
}
