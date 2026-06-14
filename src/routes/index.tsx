import { createFileRoute } from "@tanstack/react-router";
import siteHtml from "../inspirova.html?raw";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Inspirova — Marketing That Moves Brands" },
    { name: "description", content: "Inspirova builds paid media, websites, automation and creative that help ambitious brands grow." },
    { property: "og:title", content: "Inspirova — Marketing That Moves Brands" },
    { property: "og:description", content: "Paid media, websites, automation and creative built for measurable growth." },
  ] }),
  component: HomePage,
});

function HomePage() {
  return (
    <iframe
      title="Inspirova"
      srcDoc={siteHtml}
      className="block h-screen w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  );
}