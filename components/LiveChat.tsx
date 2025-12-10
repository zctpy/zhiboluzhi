import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface LiveChatProps {
  messages: ChatMessage[];
}

export const LiveChat: React.FC<LiveChatProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={containerRef}
      className="h-64 w-3/4 overflow-y-auto no-scrollbar mask-image-gradient flex flex-col justify-end space-y-2 pb-2"
      style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20%)' }}
    >
      {messages.map((msg) => (
        <div key={msg.id} className="bg-black/20 backdrop-blur-sm rounded-full px-3 py-1.5 self-start max-w-full break-words text-sm shadow-sm">
          <span className="font-bold mr-2" style={{ color: msg.color }}>
            {msg.username}:
          </span>
          <span className="text-white/90 drop-shadow-md">{msg.message}</span>
        </div>
      ))}
    </div>
  );
};