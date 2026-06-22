"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

// Dynamically import react-force-graph-2d to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export default function KnowledgeGraph({ token }: { token: string }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const graphRef = useRef<any>();

  useEffect(() => {
    async function fetchData() {
      try {
        const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";
        const res = await fetch(`${GATEWAY}/api/graph`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setGraphData(data);
        }
      } catch (err) {
        console.error("Failed to fetch graph data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  const handleNodeClick = useCallback((node: any) => {
    // Center/zoom on node
    graphRef.current?.centerAt(node.x, node.y, 1000);
    graphRef.current?.zoom(8, 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
        <LoaderCircle className="mb-4 h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm">Mapping Knowledge Graph...</p>
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
        <p className="text-sm">No documents found. Upload manuals to generate the graph.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel="name"
        nodeAutoColorBy="group"
        nodeRelSize={6}
        linkColor={() => "rgba(255,255,255,0.2)"}
        onNodeClick={handleNodeClick}
        width={typeof window !== "undefined" ? window.innerWidth - 360 : 800} // rough estimate for sidebar
        height={typeof window !== "undefined" ? window.innerHeight - 64 : 600}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fillRect(
            node.x - bckgDimensions[0] / 2,
            node.y - bckgDimensions[1] / 2,
            bckgDimensions[0],
            bckgDimensions[1]
          );

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          
          // Color based on group
          if (node.group === "document") ctx.fillStyle = "#60a5fa"; // blue-400
          else if (node.group === "equipment") ctx.fillStyle = "#c084fc"; // purple-400
          else if (node.group === "parameter") ctx.fillStyle = "#34d399"; // emerald-400
          else ctx.fillStyle = "#f87171"; // red-400 (safety)

          ctx.fillText(label, node.x, node.y);

          node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          const bckgDimensions = node.__bckgDimensions;
          bckgDimensions && ctx.fillRect(
            node.x - bckgDimensions[0] / 2,
            node.y - bckgDimensions[1] / 2,
            bckgDimensions[0],
            bckgDimensions[1]
          );
        }}
      />
      <div className="absolute top-20 right-6 rounded-xl bg-black/60 p-4 text-xs text-white backdrop-blur-sm">
        <p className="font-bold mb-2">Legend</p>
        <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-blue-400"></span> Document</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-purple-400"></span> Equipment</div>
        <div className="flex items-center gap-2 mb-1"><span className="w-3 h-3 rounded-full bg-emerald-400"></span> Parameter</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400"></span> Standard</div>
      </div>
    </div>
  );
}
