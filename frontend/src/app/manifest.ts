import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CampusUNSA",
    short_name: "CampusUNSA",
    description: "Hub Académico de entregas y recordatorios para la Universidad Nacional de San Agustín",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: "#8B0000",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
