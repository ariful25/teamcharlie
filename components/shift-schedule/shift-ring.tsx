"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type RingShift = { id: string; name: string; startTime: string; endTime: string; colorHex: string };
export type RingChip = { userId: string; name: string; status: "WORKING" | "WEEKEND" | "LEAVE"; angle: number; color?: string };

const STATUS_COLOR: Record<string, string> = { WORKING: "#34d399", WEEKEND: "#f59e0b", LEAVE: "#f87171" };

function timeToAngle(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h * 60 + m) / (24 * 60)) * Math.PI * 2;
}

function ShiftArc({ shift, radius }: { shift: RingShift; radius: number }) {
  const startAngle = timeToAngle(shift.startTime) - Math.PI / 2;
  let endAngle = timeToAngle(shift.endTime) - Math.PI / 2;
  if (endAngle <= startAngle) endAngle += Math.PI * 2; // crosses midnight

  const curve = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 48;
    for (let i = 0; i <= segments; i++) {
      const t = startAngle + ((endAngle - startAngle) * i) / segments;
      points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    return points;
  }, [startAngle, endAngle, radius]);

  return <Line points={curve} color={shift.colorHex} lineWidth={4} transparent opacity={0.95} />;
}

function DateCenter({ dayLabel, dateLabel }: { dayLabel: string; dateLabel: string }) {
  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.4}>
      <mesh>
        <torusGeometry args={[0.55, 0.05, 16, 48]} />
        <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.5} />
      </mesh>
      <Html center distanceFactor={7}>
        <div className="pointer-events-none select-none text-center font-display">
          <p className="text-lg font-bold tracking-tight text-white drop-shadow">{dayLabel}</p>
          <p className="text-xs font-medium text-cyan-200/90">{dateLabel}</p>
        </div>
      </Html>
    </Float>
  );
}

function EmployeeChip({ chip, radius }: { chip: RingChip; radius: number }) {
  const [hovered, setHovered] = useState(false);
  const x = Math.cos(chip.angle) * radius;
  const z = Math.sin(chip.angle) * radius;
  const color = chip.color ?? STATUS_COLOR[chip.status];

  return (
    <group position={[x, 0.3, z]}>
      <mesh onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)} scale={hovered ? 1.3 : 1}>
        <sphereGeometry args={[0.14, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.9 : 0.5} />
      </mesh>
      {hovered && (
        <Html center distanceFactor={9}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-lg bg-black/70 px-2 py-1 text-[11px] text-white backdrop-blur">
            {chip.name} · {chip.status.charAt(0) + chip.status.slice(1).toLowerCase()}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function ShiftRing({
  shifts,
  chips,
  dayLabel,
  dateLabel,
}: {
  shifts: RingShift[];
  chips: RingChip[];
  dayLabel: string;
  dateLabel: string;
}) {
  const ringRadius = 2.6;

  return (
    <div className="h-[340px] w-full overflow-hidden rounded-2xl">
      <Canvas camera={{ position: [0, 4.2, 5.5], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} intensity={1.2} color="#7dd3fc" />
        <pointLight position={[-5, -3, -5]} intensity={0.6} color="#a78bfa" />
        <DateCenter dayLabel={dayLabel} dateLabel={dateLabel} />
        {shifts.map((s) => (
          <ShiftArc key={s.id} shift={s} radius={ringRadius} />
        ))}
        {chips.map((c) => (
          <EmployeeChip key={c.userId} chip={c} radius={ringRadius} />
        ))}
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.4} maxPolarAngle={Math.PI / 2.1} minPolarAngle={Math.PI / 3} />
      </Canvas>
    </div>
  );
}
