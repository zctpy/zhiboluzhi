import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Settings, 
  X, 
  User, 
  Heart, 
  MessageCircle, 
  Share2, 
  Disc,
  StopCircle,
  Sparkles,
  Download,
  Monitor,
  MonitorUp,
  RefreshCw
} from 'lucide-react';
import { LiveChat } from './components/LiveChat';
import { FloatingHearts } from './components/FloatingHearts';
import { generateViewerComments } from './services/geminiService';
import { ChatMessage, FloatingHeart, StreamStatus } from './types';

// Constants
const VIEWER_COLORS = ['#FF0055', '#00F0FF', '#00FF7F', '#FFD700', '#FF8C00', '#DA70D6'];
const RANDOM_USERNAMES = ['小明', '阿杰', '茜茜', '大伟', '安娜', '子轩', '小美', '老张'];

const App: React.FC = () => {
  // --- State ---
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [viewerCount, setViewerCount] = useState(1205);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  // --- Initialization ---
  useEffect(() => {
    initCamera();
    return () => {
      cleanupStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const initCamera = async () => {
    try {
      // If we are currently recording, stop it properly
      if (streamStatus === 'recording') {
         stopRecording();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true
      });
      
      // Cleanup old stream AFTER getting new one
      cleanupStream();

      updateStream(stream);
      setIsScreenSharing(false);
      setHasPermissions(true);
      setCameraEnabled(true);
      
      addChatMessage("系统", "已切换至摄像头。", true);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      // Only alert if we don't have permissions at all
      if (!hasPermissions) {
          alert("请允许访问摄像头和麦克风以使用此应用。");
      }
    }
  };

  const startScreenShare = async (): Promise<boolean> => {
    // Check support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("您的浏览器不支持屏幕分享功能 (Your browser does not support screen sharing).");
        return false;
    }

    try {
      // 1. Get Screen Video
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false 
      });

      // 2. Get Mic Audio (Graceful fallback)
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
      } catch (audioErr) {
        console.warn("Mic access failed during screen share:", audioErr);
        addChatMessage("系统", "无法访问麦克风，仅共享屏幕画面。", true);
      }

      // 3. Combine them
      const tracks = [
        ...displayStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : [])
      ];
      const combinedStream = new MediaStream(tracks);

      // Handle user stopping share from browser UI (e.g. "Stop Sharing" button)
      displayStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            stopRecording();
        }
        // Switch back to camera automatically
        initCamera();
      };

      cleanupStream();
      updateStream(combinedStream);
      setIsScreenSharing(true);
      setCameraEnabled(true);
      return true;

    } catch (err: any) {
      console.error("Screen share error:", err);
      
      // Handle Permission Policy Error specifically
      if (err.message && err.message.includes("permissions policy")) {
          alert("无法启动录屏：当前运行环境禁止了 'display-capture' 权限 (Access to display-capture is disallowed by permissions policy)。");
          addChatMessage("系统", "环境限制：无法启动录屏。", true);
          return false;
      }

      // Don't alert if user just cancelled the picker (NotAllowedError)
      if (err.name === 'NotAllowedError') {
         addChatMessage("系统", "您取消了屏幕共享。", true);
      } else {
         alert("屏幕共享启动失败，请重试。");
      }
      return false;
    }
  };

  const updateStream = (stream: MediaStream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    setMicEnabled(stream.getAudioTracks().some(t => t.enabled));
  };

  const toggleSource = () => {
    if (isScreenSharing) {
      initCamera();
    } else {
      startScreenShare();
    }
  };

  // One-click handler: Select Screen -> Start Recording
  const handleScreenRecord = async () => {
    // If we are already recording, stop it first.
    if (streamStatus === 'recording') {
        stopRecording();
        // We continue to switch source and start new recording
        addChatMessage("系统", "停止当前录制，准备切换...", true);
    }

    const success = await startScreenShare();
    if (success) {
        // Wait briefly for stream to stabilize
        setTimeout(() => {
            startRecording();
        }, 800);
    }
  };

  // --- Recording Logic ---
  const startRecording = useCallback(() => {
    if (!streamRef.current) {
        console.error("No stream to record");
        return;
    }

    setRecordedChunks([]);
    setDownloadUrl(null);
    
    // Remove specific codecs to maximize compatibility (Chrome/Safari differences)
    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
    }
    
    try {
        const recorder = new MediaRecorder(streamRef.current, options);

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                setRecordedChunks((prev) => [...prev, event.data]);
            }
        };

        recorder.start(1000); // Collect chunks every second
        mediaRecorderRef.current = recorder;
        setStreamStatus('recording');
        
        // Start Timer
        setElapsedTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

        addChatMessage("系统", "录制已开始...", true);
    } catch (e) {
        console.error("Failed to start recorder", e);
        addChatMessage("系统", "无法开始录制，请检查浏览器支持。", true);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setStreamStatus('idle');
      if (timerRef.current) clearInterval(timerRef.current);
      addChatMessage("系统", "录制已停止，可以导出视频了。", true);
    }
  }, []);

  useEffect(() => {
    // Generate download URL when chunks update and we are NOT recording
    if (streamStatus === 'idle' && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    }
  }, [streamStatus, recordedChunks]);

  // --- AI Interaction ---
  const triggerAIInteractions = async () => {
    addChatMessage("系统", "正在召唤 AI 观众...", true);
    
    const comments = await generateViewerComments("正在直播聊天，气氛很嗨！");
    
    let delay = 500;
    comments.forEach((comment) => {
      setTimeout(() => {
        const randomUser = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
        const randomColor = VIEWER_COLORS[Math.floor(Math.random() * VIEWER_COLORS.length)];
        addChatMessage(randomUser, comment, false, randomColor);
        triggerHeart();
      }, delay);
      delay += Math.floor(Math.random() * 1500) + 500;
    });
  };

  // --- Helpers ---
  const addChatMessage = (username: string, message: string, isSystem = false, color = '#FFFFFF') => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(),
      username,
      message,
      color,
      isSystem
    };
    setChatMessages((prev) => [...prev, newMessage].slice(-50)); // Keep last 50
  };

  const triggerHeart = () => {
    const newHeart: FloatingHeart = {
      id: Date.now(),
      left: 50 + (Math.random() * 40 - 20), // Randomize horizontal position around center
      color: VIEWER_COLORS[Math.floor(Math.random() * VIEWER_COLORS.length)]
    };
    setHearts((prev) => [...prev, newHeart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter(h => h.id !== newHeart.id));
    }, 2000); // Cleanup after animation
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setCameraEnabled(!cameraEnabled);
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setMicEnabled(!micEnabled);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Render ---
  return (
    <div className="flex justify-center items-center min-h-screen bg-neutral-900 font-sans">
      
      {/* Mobile Wrapper */}
      <div className="relative w-full max-w-md h-[100dvh] bg-black overflow-hidden shadow-2xl md:rounded-3xl border-neutral-800 md:border-4">
        
        {/* Video Layer */}
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${cameraEnabled ? 'opacity-100' : 'opacity-0'} ${isScreenSharing ? 'object-contain bg-gray-900' : 'object-cover'}`} 
        />
        {!cameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <VideoOff size={64} />
          </div>
        )}

        {/* UI Overlay Layer */}
        <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none">
          
          {/* Header */}
          <div className="flex justify-between items-start pointer-events-auto">
            {/* User Profile */}
            <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-md rounded-full p-1 pr-4 border border-white/10">
              <div className="relative">
                <img 
                  src="https://picsum.photos/100/100" 
                  alt="Profile" 
                  className="w-9 h-9 rounded-full border-2 border-[#FF0055]"
                />
                <div className="absolute -bottom-1 -right-1 bg-[#FF0055] rounded-full p-0.5">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">直播达人</span>
                <span className="text-[10px] text-gray-300 leading-tight">1.2w 粉丝</span>
              </div>
              <button className="bg-[#FF0055] text-white text-xs font-bold px-3 py-1 rounded-full hover:bg-red-600 transition">
                关注
              </button>
            </div>

            {/* Viewer Count & Close */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <User size={14} className="text-white" />
                <span className="text-sm font-bold">{viewerCount}</span>
              </div>
              <button className="p-1.5 rounded-full bg-black/20 backdrop-blur-md hover:bg-black/40">
                <X size={24} className="text-white" />
              </button>
            </div>
          </div>

          {/* Right Sidebar Actions */}
          <div className="absolute right-4 bottom-24 flex flex-col items-center space-y-4 pointer-events-auto">
             
             {/* One-Click Record Screen Button */}
             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={handleScreenRecord}
                   className="p-3 bg-red-600/80 backdrop-blur-md rounded-full hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-500/20"
                >
                  <MonitorUp size={28} className="text-white" />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">一键录屏</span>
             </div>

             {/* Switch Source */}
             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleSource}
                   className={`p-3 backdrop-blur-md rounded-full active:scale-95 transition ${isScreenSharing ? 'bg-blue-600/80 hover:bg-blue-500' : 'bg-black/20 hover:bg-black/40'}`}
                >
                  {isScreenSharing ? <RefreshCw size={28} /> : <Monitor size={28} />}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">{isScreenSharing ? '切回镜头' : '屏幕共享'}</span>
             </div>

             {/* Toggle Video Track (Mute Video) */}
             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleCamera}
                   // Use a different style if disabled, but allow toggling black screen even in screen share if desired (usually not)
                   // Just keep it enabled for now as it simply mutes the video track
                   className={`p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition`}
                >
                  {cameraEnabled ? <Video size={28} /> : <VideoOff size={28} className="text-red-500"/>}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">画面</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleMic}
                   className="p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition"
                >
                  {micEnabled ? <Mic size={28} /> : <MicOff size={28} className="text-red-500"/>}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">麦克风</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                  onClick={triggerAIInteractions}
                  className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full hover:brightness-110 active:scale-95 transition shadow-lg shadow-purple-500/30"
                >
                  <Sparkles size={28} />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">AI氛围</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                  onClick={triggerHeart}
                  className="p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition"
                >
                  <Heart size={28} className={hearts.length > 0 ? "fill-red-500 text-red-500" : ""} />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md">点赞</span>
             </div>
          </div>

          {/* Bottom Area: Chat & Controls */}
          <div className="flex flex-col space-y-4 mb-2 pointer-events-auto w-full">
            
            {/* Chat Overlay */}
            <div className="relative w-full">
               <LiveChat messages={chatMessages} />
            </div>

            {/* Bottom Controls Bar */}
            <div className="flex items-center justify-between px-2 pt-2 pb-4">
              
              {/* Message Input (Visual Only) */}
              <div className="flex-1 flex items-center bg-white/10 backdrop-blur-md rounded-full h-10 px-4 mr-3 border border-white/10 hover:bg-white/20 transition cursor-text">
                 <MessageCircle size={18} className="text-white/70 mr-2" />
                 <span className="text-sm text-white/50">说点什么...</span>
              </div>

              {/* Record Button / Timer */}
              {streamStatus === 'recording' ? (
                <div className="flex items-center space-x-2">
                   <div className="flex items-center bg-red-500/20 backdrop-blur-md border border-red-500/50 rounded-full px-3 py-1 h-10">
                     <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                     <span className="text-white font-mono text-sm">{formatTime(elapsedTime)}</span>
                   </div>
                   <button 
                    onClick={stopRecording}
                    className="w-10 h-10 flex items-center justify-center bg-red-600 rounded-full hover:bg-red-700 active:scale-95 transition shadow-lg shadow-red-600/40"
                   >
                     <StopCircle size={20} fill="currentColor" />
                   </button>
                </div>
              ) : downloadUrl ? (
                <div className="flex items-center space-x-2">
                   <a 
                    href={downloadUrl} 
                    download={`stream-recording-${Date.now()}.webm`}
                    className="flex items-center justify-center h-10 px-4 bg-green-500 rounded-full font-bold text-sm hover:bg-green-600 transition shadow-lg shadow-green-500/30"
                   >
                     <Download size={16} className="mr-2"/> 保存
                   </a>
                   <button 
                    onClick={() => { setDownloadUrl(null); startRecording(); }}
                    className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition"
                   >
                      <Disc size={20} />
                   </button>
                </div>
              ) : (
                <button 
                  onClick={startRecording}
                  disabled={!hasPermissions}
                  className="w-12 h-12 rounded-full border-4 border-white flex items-center justify-center group active:scale-95 transition"
                >
                  <div className="w-9 h-9 bg-red-500 rounded-full group-hover:scale-110 transition duration-300"></div>
                </button>
              )}

              {/* Extras Button */}
              <button className="ml-3 p-2 rounded-full hover:bg-white/10 transition">
                <Settings size={24} />
              </button>

            </div>
          </div>
        </div>

        {/* Floating Hearts Layer */}
        <FloatingHearts hearts={hearts} />

      </div>
    </div>
  );
};

export default App;