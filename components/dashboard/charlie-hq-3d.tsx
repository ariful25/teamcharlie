"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, Html, OrbitControls } from "@react-three/drei";
import { useRouter } from "next/navigation";

export type ClientNode = {
  id: string;
  name: string;
  completedTasks: number;
  totalTasks: number;
  followUps: number;
  color: string;
};

function CenterCore() {
  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
      <mesh>
        <icosahedronGeometry args={[1.1, 1]} />
        <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.6} wireframe />
      </mesh>
      <Html center distanceFactor={8}>
        <div className="pointer-events-none select-none rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-cyan-200 backdrop-blur">
          CHARLIE
        </div>
      </Html>
    </Float>
  );
}

function ClientOrb({
  node,
  position,
  onSelect,
}: {
  node: ClientNode;
  position: [number, number, number];
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={1}>
        <mesh
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onClick={() => onSelect(node.id)}
          scale={hovered ? 1.15 : 1}
        >
          <sphereGeometry args={[0.55, 32, 32]} />
          <meshStandardMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={hovered ? 0.9 : 0.4}
          />
        </mesh>
        <Html center distanceFactor={8}>
          <div
            className="pointer-events-none select-none rounded-xl bg-black/60 px-2.5 py-1.5 text-center text-[11px] text-white backdrop-blur"
            style={{ minWidth: 90 }}
          >
            <p className="font-semibold">{node.name}</p>
            {hovered && (
              <div className="mt-1 space-y-0.5 text-[10px] text-white/80">
                <p>
                  {node.completedTasks}/{node.totalTasks} tasks
                </p>
                <p>{node.followUps} follow-ups</p>
              </div>
            )}
          </div>
        </Html>
      </Float>
    </group>
  );
}

export default function CharlieHq3D({ nodes }: { nodes: ClientNode[] }) {
  const router = useRouter();

  const positions = useMemo<[number, number, number][]>(() => {
    const radius = 3.2;
    return nodes.map((_, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      return [Math.cos(angle) * radius, Math.sin(angle * 0.6) * 0.6, Math.sin(angle) * radius];
    });
  }, [nodes]);

  return (
    <div className="h-[380px] w-full overflow-hidden rounded-2xl">
      <Canvas camera={{ position: [0, 2, 8], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} intensity={1.2} color="#7dd3fc" />
        <pointLight position={[-5, -3, -5]} intensity={0.6} color="#a78bfa" />
        <CenterCore />
        {nodes.map((node, i) => (
          <ClientOrb
            key={node.id}
            node={node}
            position={positions[i]}
            onSelect={(id) => router.push(`/clients/${id}`)}
          />
        ))}
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
