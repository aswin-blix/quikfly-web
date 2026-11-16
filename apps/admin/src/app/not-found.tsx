import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center text-center px-4">
      <div>
        <p className="text-5xl font-semibold text-subtle">404</p>
        <p className="font-medium text-fg mt-2">This page doesn&apos;t exist</p>
        <Link href="/" className="inline-block mt-4 text-accent font-medium hover:underline">Back to the dashboard</Link>
      </div>
    </div>
  );
}
