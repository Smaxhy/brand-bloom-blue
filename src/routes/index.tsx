import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import siteHtml from "../inspirova.html?raw";
import logo from "@/assets/inspirova-logo.png";

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
  const navigate = useNavigate({ from: "/" });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderedHtml = siteHtml.replaceAll("__LOGO__", logo).replace(
    "</body>",
    `<script>
      function reportHeight() {
        window.parent.postMessage({ type: 'inspirova:height', height: document.documentElement.scrollHeight }, '*');
      }
      reportHeight();
      window.addEventListener('load', reportHeight);
      document.querySelectorAll('a[href="/results"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
          event.preventDefault();
          window.parent.postMessage({ type: 'inspirova:navigate', path: '/results' }, '*');
        });
      });
      document.querySelectorAll('a[href="#contact"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
          event.preventDefault();
          var target = document.getElementById('contact');
          if (target) window.parent.postMessage({ type: 'inspirova:scroll', top: target.offsetTop }, '*');
        });
      });
    </script></body>`,
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "inspirova:navigate" && event.data.path === "/results") {
        navigate({ to: "/results" });
      }
      if (event.data?.type === "inspirova:height" && iframeRef.current) {
        iframeRef.current.style.height = `${event.data.height}px`;
      }
      if (event.data?.type === "inspirova:scroll" && iframeRef.current) {
        const iframeTop = iframeRef.current.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: iframeTop + event.data.top, behavior: "smooth" });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  const syncIframeHeight = () => {
    const iframe = iframeRef.current;
    const documentHeight = iframe?.contentDocument?.documentElement.scrollHeight;
    if (iframe && documentHeight) iframe.style.height = `${documentHeight}px`;
  };

  return (
    <iframe
      ref={iframeRef}
      title="Inspirova"
      srcDoc={renderedHtml}
      onLoad={syncIframeHeight}
      className="block h-[7800px] w-full border-0 md:h-[6500px]"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
    />
  );
}