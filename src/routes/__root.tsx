import {
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import "../styles.css";

export const rootRoute = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Lucky Seven — Push your luck" },
      {
        name: "description",
        content: "A fast, realtime push-your-luck card game for friends.",
      },
      { name: "theme-color", content: "#e8c777" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main className="center-shell">
      <p className="eyebrow">404</p>
      <h1>That table vanished.</h1>
      <a className="button button-primary" href="/">Back home</a>
    </main>
  ),
});

export const Route = rootRoute;

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
