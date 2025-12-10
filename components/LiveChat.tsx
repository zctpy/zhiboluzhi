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
      className="h-64 w-3/4 overflow-y-auto no-scrollbar mask-image-gradient flex flex-col justify-end space-y-2 pb-2 pl-2"
      style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10%)' }}
    >
      {messages.map((msg) => (
        <div key={msg.id} className={`self-start max-w-full break-words text-sm shadow-sm ${msg.isHost ? 'my-1' : ''}`}>
           <div className={`inline-block px-3 py-1.5 rounded-2xl ${
             msg.isSystem 
               ? 'bg-transparent text-yellow-300 font-medium' // System message styling
               : msg.isHost 
                 ? 'bg-[#FF0055]/90 backdrop-blur-md text-white border border-white/20' // Host message styling
                 : 'bg-black/20 backdrop-blur-sm' // Normal viewer styling
           }`}>
            {msg.isHost && (
               <span className="bg-yellow-500 text-black text-[10px] font-bold px-1 rounded mr-1.5 align-middle">
                 主播
               </span>
            )}
            
            {!msg.isSystem && !msg.isHost && (
              <span className="font-bold mr-2 drop-shadow-md" style={{ color: msg.color }}>
                {msg.username}:
              </span>
            )}
            
            <span className={`drop-shadow-md ${msg.isSystem ? 'text-xs' : 'text-white/95'}`}>
              {msg.message}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};