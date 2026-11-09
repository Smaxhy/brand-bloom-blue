import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate({ from: "/" });
  const renderedHtml = siteHtml.replaceAll("__LOGO__", logo).replaceAll("__PROOF__", proof).replaceAll("__PUBLIC_CSS__", publicCss).replace(
    "</body>",
    `<script>
      document.querySelectorAll('a[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
          var target = document.getElementById(link.getAttribute('href').slice(1));
          if (target) { event.preventDefault(); target.scrollIntoView({ block: 'start' }); }
        });
      });
      // Links from the results page land here as /#how, /#faq, /#contact and so on.
      var initialAnchor = window.parent.location.hash.slice(1);
      if (['quoteForm', 'pricing', 'services', 'how', 'faq', 'contact'].indexOf(initialAnchor) !== -1) {
        window.addEventListener('load', function() {
          setTimeout(function() {
            if (initialAnchor === 'contact') { document.querySelector('[data-open-contact]')?.click(); return; }
            document.getElementById(initialAnchor)?.scrollIntoView({ block: 'start' });
          }, 100);
        });
      }
      // Route any internal link (e.g. /results, /admin) through the parent SPA
      // so navigation is instant. The target="_top" on the anchors is a fallback
      // if JavaScript is unavailable.
      document.querySelectorAll('a[href^="/"]').forEach(function(link) {
        var path = link.getAttribute('href');
        link.addEventListener('click', function(event) {
          event.preventDefault();
          try { window.top.location.assign(path); }
          catch (e) { window.parent.postMessage({ type: 'inspirova:navigate', path: path }, '*'); }
        });
      });
    </script></body>`,
  );

  useEffect(() => {
    const allowedPaths = ["/results", "/admin", "/privacy"];
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
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
      ref={frame}
      title="Inspirova"
      id="main-content"
      srcDoc={renderedHtml}
      className="block h-screen w-px min-w-full max-w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  );
}