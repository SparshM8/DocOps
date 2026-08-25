"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { LoaderCircle, FileText, Settings, ShieldAlert, Zap, X } from "lucide-react";

// Dynamically import react-force-graph-2d to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export default function KnowledgeGraph({ token, onRunQuery }: { token: string, onRunQuery?: (q: string) => void }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const graphRef = useRef<any>(null);

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
    setSelectedNode(node);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
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
    <div className="h-full w-full overflow-hidden bg-slate-950 relative">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel="name"
        nodeAutoColorBy="group"
        nodeRelSize={6}
        linkColor={() => "rgba(255,255,255,0.2)"}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        width={typeof window !== "undefined" ? window.innerWidth - 288 : 800}
        height={typeof window !== "undefined" ? window.innerHeight - 120 : 600}
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
          
          // Color and Glow based on group
          if (node.group === "document") ctx.fillStyle = "#60a5fa"; // blue-400
          else if (node.group === "equipment") ctx.fillStyle = "#c084fc"; // purple-400
          else if (node.group === "parameter") ctx.fillStyle = "#34d399"; // emerald-400
          else ctx.fillStyle = "#f87171"; // red-400 (safety)

          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 12;

          // Highlight selected node
          if (selectedNode && selectedNode.id === node.id) {
            ctx.fillStyle = "#fbbf24"; // amber-400
            ctx.shadowColor = "#fbbf24";
            ctx.shadowBlur = 24;
          }

          ctx.fillText(label, node.x, node.y);
          node.__bckgDimensions = bckgDimensions;
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
      
      {/* Legend */}
      <div className="absolute top-6 left-6 rounded-xl bg-slate-900/80 border border-slate-700/50 p-4 text-xs text-slate-300 backdrop-blur-md shadow-lg pointer-events-none">
        <p className="font-bold mb-3 text-white tracking-widest uppercase">Entity Legend</p>
        <div className="flex items-center gap-3 mb-2"><span className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"></span> Document Source</div>
        <div className="flex items-center gap-3 mb-2"><span className="w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]"></span> Equipment Tag</div>
        <div className="flex items-center gap-3 mb-2"><span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span> Process Parameter</div>
        <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]"></span> Safety Standard</div>
      </div>

      {/* Slide-out Entity Details Panel */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 340,
        background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(12px)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        transform: selectedNode ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex", flexDirection: "column", zIndex: 10
      }}>
        {selectedNode && (
          <>
            <div className="p-5 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-3">
                {selectedNode.group === "document" && <FileText className="text-blue-400" size={20} />}
                {selectedNode.group === "equipment" && <Settings className="text-purple-400" size={20} />}
                {selectedNode.group === "parameter" && <Zap className="text-emerald-400" size={20} />}
                {selectedNode.group === "safety" && <ShieldAlert className="text-red-400" size={20} />}
                <span className="text-sm font-bold text-white uppercase tracking-widest">
                  {selectedNode.group} Node
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <h2 className="text-2xl font-black text-white mb-6 leading-tight break-words">{selectedNode.name}</h2>
              
              <div className="space-y-4 mb-8">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">Entity ID</p>
                  <p className="text-sm text-slate-200 font-mono break-all">{selectedNode.id}</p>
                </div>
                
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-semibold">Connections</p>
                  <p className="text-sm text-slate-200">
                    {graphData.links.filter((l: any) => l.source.id === selectedNode.id || l.target.id === selectedNode.id).length} direct links in graph
                  </p>
                </div>
              </div>

              {/* Contextual Actions */}
              <div className="space-y-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Copilot Actions</p>
                
                {selectedNode.group === "equipment" && (
                  <button 
                    onClick={() => onRunQuery && onRunQuery(`Perform Root Cause Analysis (RCA) on ${selectedNode.name}`)}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-lg text-sm font-bold transition-colors"
                  >
                    <Settings size={16} /> Run RCA Pipeline
                  </button>
                )}
                
                {selectedNode.group === "safety" && (
                  <button 
                    onClick={() => onRunQuery && onRunQuery(`Verify all procedures against ${selectedNode.name}`)}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white p-3 rounded-lg text-sm font-bold transition-colors"
                  >
                    <ShieldAlert size={16} /> Verify Compliance
                  </button>
                )}
                
                <button 
                  onClick={() => onRunQuery && onRunQuery(`Extract all details regarding ${selectedNode.name}`)}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg text-sm font-bold transition-colors"
                >
                  <FileText size={16} /> Extract Entity Details
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
