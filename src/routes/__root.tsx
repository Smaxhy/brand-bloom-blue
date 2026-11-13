import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import {
  META_PIXEL_BASE_CODE,
  META_PIXEL_NOSCRIPT_SRC,
  isTrackedPath,
  trackPageView,
} from "@/lib/meta-pixel";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset?.();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Inspirova Marketing" },
      { name: "description", content: "Growth-focused marketing agency specializing in AI automation, digital marketing, lead generation, and scalable customer acquisition systems for businesses." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Inspirova Marketing" },
      { property: "og:description", content: "Growth-focused marketing agency specializing in AI automation, digital marketing, lead generation, and scalable customer acquisition systems for businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Inspirova Marketing" },
      { name: "twitter:description", content: "Growth-focused marketing agency specializing in AI automation, digital marketing, lead generation, and scalable customer acquisition systems for businesses." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=Work+Sans:wght@400;500;600&family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // The Meta pixel goes on the public pages only (src/lib/meta-pixel.ts).
  const tracked = useRouterState({ select: (state) => isTrackedPath(state.location.pathname) });
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {tracked && <script dangerouslySetInnerHTML={{ __html: META_PIXEL_BASE_CODE }} />}
      </head>
      <body>
        {tracked && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={META_PIXEL_NOSCRIPT_SRC}
              alt=""
            />
          </noscript>
        )}
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // A full page load is counted by the pixel code in the head. Moving between
  // pages without a reload is counted here, once per page.
  useEffect(
    () =>
      router.subscribe("onResolved", (event) => {
        if (event.fromLocation && event.pathChanged) trackPageView(event.toLocation.pathname);
      }),
    [router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
