import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import siteHtml from "../inspirova.html?raw";
import logo from "@/assets/inspirova-logo.png";
import proof from "@/assets/proof-1.png";
import publicCss from "../styles.css?url";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Inspirova — Marketing That Moves Brands" },
    { name: "description", content: "Inspirova builds paid media, websites, automation and creative that help ambitious brands grow." },
    { property: "og:title", content: "Inspirova — Marketing That Moves Brands" },
    { property: "og:description", content: "Paid media, websites, automation and creative built for measurable growth." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate({ from: "/" });
  const renderedHtml = siteHtml.replaceAll("__LOGO__", logo).replaceAll("__PROOF__", proof).replaceAll("__PUBLIC_CSS__", publicCss).replace(
    "</body>",
    `<script>
      // Route any internal link (e.g. /results, /admin) through the parent SPA
      // so navigation is instant. The target="_top" on the anchors is a fallback
      // if JavaScript is unavailable.
      document.querySelectorAll('a[href^="/"]').forEach(function(link) {
        var path = link.getAttribute('href');
        link.addEventListener('click', function(event) {
          event.preventDefault();
          window.parent.postMessage({ type: 'inspirova:navigate', path: path }, '*');
        });
      });
    </script></body>`,
  );

  useEffect(() => {
    const allowedPaths = ["/results", "/admin", "/privacy"];
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "inspirova:navigate" &&
        typeof event.data.path === "string" &&
        allowedPaths.includes(event.data.path)
      ) {
        navigate({ to: event.data.path });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  return (
    <iframe
      title="Inspirova"
      id="main-content"
      srcDoc={renderedHtml}
      className="block h-screen w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  );
}