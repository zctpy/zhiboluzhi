import React from 'react';
import { FloatingHeart } from '../types';
import { Heart } from 'lucide-react';

interface FloatingHeartsProps {
  hearts: FloatingHeart[];
}

export const FloatingHearts: React.FC<FloatingHeartsProps> = ({ hearts }) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute bottom-20 animate-float"
          style={{ left: `${heart.left}%` }}
        >
          <Heart fill={heart.color} className="w-8 h-8" style={{ color: heart.color }} />
        </div>
      ))}
    </div>
  );
};