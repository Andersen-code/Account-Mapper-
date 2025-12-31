
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { OrgNode, AccountAnalysis } from '../types.ts';

interface OrgChartProps {
  data: AccountAnalysis;
  filterDepartment: string | null;
  onDeleteStakeholder: (id: string) => void;
}

const OrgChart: React.FC<OrgChartProps> = ({ data, filterDepartment, onDeleteStakeholder }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);

  useEffect(() => {
    if (!data || !data.contacts || !svgRef.current || !containerRef.current) return;

    const nodeWidth = 260;
    const nodeHeight = 120;
    const verticalSpacing = 200;
    const horizontalSpacing = 60;

    const svg = d3.select(svgRef.current)
      .attr("id", "org-chart-svg")
      .attr("width", "100%")
      .attr("height", 900);
    
    svg.selectAll("*").remove();
    
    // Embed styling for capture
    svg.append("defs").append("style").text(`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
      text { font-family: 'Inter', sans-serif; pointer-events: none; user-select: none; }
    `);

    // Solid export background
    svg.append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "#ffffff");

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 2.5])
      .on("zoom", (event) => g.attr("transform", event.transform));
    
    svg.call(zoom as any);

    try {
      let contacts = [...data.contacts];
      if (filterDepartment) {
        contacts = contacts.filter(c => c.department === filterDepartment);
      }

      if (contacts.length === 0) return;

      const VIRTUAL_ROOT_ID = "__ORG_ROOT__";
      const validIds = new Set(contacts.map(d => d.id));
      
      const forestData = contacts.map(c => ({
        ...c,
        managerId: (c.managerId && validIds.has(c.managerId)) ? c.managerId : VIRTUAL_ROOT_ID
      }));

      forestData.push({ 
        id: VIRTUAL_ROOT_ID, 
        name: data.accountName, 
        title: "Account HQ", 
        managerId: null, 
        department: "Core", 
        stance: "Neutral", 
        powerLevel: "Low", 
        buyingRole: "Unknown",
        seniorityRank: 0,
        strategicAction: ""
      } as any);

      const stratify = d3.stratify<OrgNode>().id(d => d.id).parentId(d => d.managerId || null);
      const root = stratify(forestData);
      
      root.sort((a, b) => (a.data.seniorityRank || 10) - (b.data.seniorityRank || 10));

      const treeLayout = d3.tree<d3.HierarchyNode<OrgNode>>()
        .nodeSize([nodeWidth + horizontalSpacing, verticalSpacing]);
      
      treeLayout(root as any);

      const descendants = root.descendants();
      const links = root.links();

      const linkPath = (d: any) => {
        const sX = d.source.x;
        const sY = d.source.y + nodeHeight / 2;
        const tX = d.target.x;
        const tY = d.target.y - nodeHeight / 2;
        const midY = (sY + tY) / 2;
        return `M${sX},${sY} V${midY} H${tX} V${tY}`;
      };

      const linkElements = g.selectAll(".link")
        .data(links)
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 2)
        .attr("d", linkPath);

      const drag = d3.drag<SVGGElement, d3.HierarchyPointNode<OrgNode>>()
        .on("start", function(event) {
          d3.select(this).raise().attr("cursor", "grabbing");
        })
        .on("drag", function(event, d) {
          const transform = d3.zoomTransform(svgRef.current!);
          d.x += event.dx / transform.k;
          d.y += event.dy / transform.k;
          d3.select(this).attr("transform", `translate(${d.x - nodeWidth / 2},${d.y - nodeHeight / 2})`);
          linkElements.attr("d", linkPath);
        })
        .on("end", function() {
          d3.select(this).attr("cursor", "grab");
        });

      const node = g.selectAll(".node")
        .data(descendants)
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x - nodeWidth/2},${d.y - nodeHeight/2})`)
        .style("cursor", "grab")
        .on("click", (event, d) => {
          if (event.defaultPrevented) return;
          setSelectedNode(d.data);
        })
        .call(drag as any);

      node.append("rect")
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", 16)
        .attr("fill", "#ffffff")
        .attr("stroke", d => {
          if (d.data.id === VIRTUAL_ROOT_ID) return '#334155';
          if (d.data.stance === 'Resistant') return '#ef4444';
          if (d.data.stance === 'Supportive') return '#22c55e';
          return '#e2e8f0';
        })
        .attr("stroke-width", d => (d.data.seniorityRank <= 3 ? 3.5 : 1.5))
        .style("filter", "drop-shadow(0 4px 6px rgba(0,0,0,0.04))");

      node.append("path")
        .attr("d", `M 0 12 q 0 -12 12 -12 h ${nodeWidth - 24} q 12 0 12 12 v 16 h -${nodeWidth} z`)
        .attr("fill", d => {
          if (d.data.id === VIRTUAL_ROOT_ID) return '#0f172a';
          if (d.data.seniorityRank <= 3) return '#1e293b'; 
          if (d.data.buyingRole?.includes('Decision')) return '#334155';
          return '#94a3b8';
        });

      node.append("text")
        .attr("x", 16)
        .attr("y", 18)
        .attr("fill", "#ffffff")
        .style("font-weight", "800")
        .style("text-transform", "uppercase")
        .attr("font-size", "8.5px")
        .text(d => d.data.buyingRole?.toUpperCase() || "STAKEHOLDER");

      node.append("text")
        .attr("x", 16)
        .attr("y", 54)
        .attr("fill", "#0f172a")
        .style("font-weight", "800")
        .attr("font-size", "15px")
        .text(d => d.data.name.length > 24 ? d.data.name.substring(0, 22) + '..' : d.data.name);

      node.append("text")
        .attr("x", 16)
        .attr("y", 72)
        .attr("fill", "#64748b")
        .style("font-weight", "600")
        .attr("font-size", "11px")
        .text(d => (d.data.title || "Unknown").substring(0, 36));

      const badge = node.append("g").attr("transform", "translate(16, 88)");
      badge.append("rect")
        .attr("width", 110)
        .attr("height", 18)
        .attr("rx", 6)
        .attr("fill", "#f8fafc")
        .attr("stroke", "#f1f5f9");
      
      badge.append("text")
        .attr("x", 8)
        .attr("y", 12)
        .attr("fill", "#6366f1")
        .style("font-weight", "800")
        .style("text-transform", "uppercase")
        .attr("font-size", "8px")
        .text(d => (d.data.department || "General").substring(0, 18));

      const initialTransform = d3.zoomIdentity
        .translate(containerRef.current.clientWidth / 2, 80)
        .scale(0.75);
      svg.transition().duration(800).call(zoom.transform as any, initialTransform);

    } catch (err) {
      console.error("Org Chart rendering error:", err);
    }
  }, [data, filterDepartment]);

  const handleDelete = () => {
    if (selectedNode) {
      onDeleteStakeholder(selectedNode.id);
      setSelectedNode(null);
    }
  };

  return (
    <div ref={containerRef} className="w-full relative bg-white rounded-[40px] overflow-hidden min-h-[900px]">
      {selectedNode && (
        <div className="absolute top-10 right-10 z-20 w-80 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[32px] shadow-2xl p-8 animate-in slide-in-from-right-8 border-l-4 border-l-indigo-500">
          <button onClick={() => setSelectedNode(null)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{selectedNode.buyingRole}</p>
              <h4 className="text-xl font-black text-slate-900 leading-tight">{selectedNode.name}</h4>
              <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-wider">{selectedNode.title}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Strategy</p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-700 font-medium leading-relaxed italic">
                   "{selectedNode.strategicAction}"
                </div>
              </div>
              
              <div className="flex gap-4">
                 <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Power</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedNode.powerLevel === 'High' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {selectedNode.powerLevel}
                    </span>
                 </div>
                 <div className="flex-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Stance</p>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${selectedNode.stance === 'Supportive' ? 'bg-emerald-100 text-emerald-700' : selectedNode.stance === 'Resistant' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      {selectedNode.stance}
                    </span>
                 </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex gap-2">
                 <button 
                  onClick={handleDelete}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all group"
                 >
                    <svg className="w-4 h-4 text-red-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete from Map
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};

export default OrgChart;