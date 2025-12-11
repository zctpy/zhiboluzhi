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
  Disc,
  StopCircle,
  Sparkles,
  Download,
  Monitor,
  MonitorUp,
  RefreshCw,
  Send,
  Flame
} from 'lucide-react';
import { LiveChat } from './components/LiveChat';
import { FloatingHearts } from './components/FloatingHearts';
import { generateViewerComments } from './services/geminiService';
import { ChatMessage, FloatingHeart, StreamStatus } from './types';

// Constants
const VIEWER_COLORS = ['#FF0055', '#00F0FF', '#00FF7F', '#FFD700', '#FF8C00', '#DA70D6', '#FFFFFF'];
const RANDOM_USERNAMES = ['小明', '阿杰', '茜茜', '大伟', '安娜', '子轩', '小美', '老张', 'Cathy', 'Tom', '想飞的鱼', '快乐星球'];

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
  const [heatCount, setHeatCount] = useState(3.5); // Heat in 'w' (10k)
  const [elapsedTime, setElapsedTime] = useState(0);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Source stream (Cam/Screen)
  const timerRef = useRef<number | null>(null);

  // --- Initialization ---
  useEffect(() => {
    initCamera();
    
    // Ambient events loop
    const ambientInterval = setInterval(() => {
        const rand = Math.random();
        if (rand > 0.6) {
             const user = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
             if (rand > 0.85) {
                addChatMessage("系统", `${user} 来了`, true);
             } else if (rand > 0.95) {
                addChatMessage("系统", `${user} 分享了直播间`, true);
             }
             setViewerCount(prev => prev + Math.floor(Math.random() * 5) - 1);
             setHeatCount(prev => parseFloat((prev + 0.01).toFixed(2)));
        }
    }, 2000);

    return () => {
      cleanupStream();
      clearInterval(ambientInterval);
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
      if (streamStatus === 'recording') stopRecording();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true
      });
      
      cleanupStream();
      updateStream(stream);
      setIsScreenSharing(false);
      setHasPermissions(true);
      setCameraEnabled(true);
      
      addChatMessage("系统", "欢迎来到直播间！直播已准备就绪。", true);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      if (!hasPermissions) alert("请允许访问摄像头和麦克风以使用此应用。");
    }
  };

  const startScreenShare = async (): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("您的浏览器不支持屏幕分享功能。");
        return false;
    }

    try {
      // Prompt user instructions
      addChatMessage("系统", "请选择'整个屏幕'并勾选'分享系统音频'以获得最佳效果。", true);

      // 1. Get Display Stream (Video + System Audio)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true, 
          audio: true // Request system audio
      });
      
      // 2. Get Mic Audio separately
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            } 
        });
      } catch (audioErr) {
        console.warn("Mic access failed during screen share:", audioErr);
        addChatMessage("系统", "无法访问麦克风，仅共享屏幕画面。", true);
      }

      // 3. Merge Tracks: Video + System Audio + Mic Audio
      const tracks = [
        ...displayStream.getVideoTracks(),
        ...displayStream.getAudioTracks(), // System Audio
        ...(audioStream ? audioStream.getAudioTracks() : []) // Mic Audio
      ];
      const combinedStream = new MediaStream(tracks);

      // Handle Stop Sharing via Browser UI
      displayStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            stopRecording();
        }
        initCamera(); // Fallback to camera
      };

      cleanupStream();
      updateStream(combinedStream);
      setIsScreenSharing(true);
      setCameraEnabled(true);
      return true;

    } catch (err: any) {
      console.error("Screen share error:", err);
      if (err.message && err.message.includes("permissions policy")) {
          alert("无法启动录屏：当前运行环境禁止了 'display-capture' 权限。");
          return false;
      }
      if (err.name !== 'NotAllowedError') alert("屏幕共享启动失败，请重试。");
      return false;
    }
  };

  const updateStream = (stream: MediaStream) => {
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    // Update mic status based on presence of ANY audio track
    setMicEnabled(stream.getAudioTracks().length > 0);
  };

  const toggleSource = () => {
    if (isScreenSharing) {
      initCamera();
    } else {
      startScreenShare();
    }
  };

  const handleScreenRecord = async () => {
    if (streamStatus === 'recording') {
        stopRecording();
        addChatMessage("系统", "停止当前录制，准备切换...", true);
    }
    const success = await startScreenShare();
    if (success) {
        // Wait longer for full-screen switch
        setTimeout(() => startRecording(), 1000);
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
    
    // Direct Stream Recording - Most stable method
    const streamToRecord = streamRef.current;

    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
    }
    
    try {
        const recorder = new MediaRecorder(streamToRecord, options);

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                setRecordedChunks((prev) => [...prev, event.data]);
            }
        };

        recorder.onstop = () => {
            setStreamStatus('idle');
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            addChatMessage("系统", "录制已完成。", true);
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setStreamStatus('recording');
        
        setElapsedTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

        addChatMessage("系统", "开始录制...", true);
    } catch (e) {
        console.error("Failed to start recorder", e);
        addChatMessage("系统", "无法开始录制，请检查浏览器支持。", true);
    }
  }, []); // Stable dependency

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setStreamStatus('idle');
      if (timerRef.current) {
         clearInterval(timerRef.current);
         timerRef.current = null;
      }
      if (recorder) {
        addChatMessage("系统", "录制已停止 (修复)。", true);
      }
    }
  }, []);

  useEffect(() => {
    if (streamStatus === 'idle' && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    }
  }, [streamStatus, recordedChunks]);

  // --- Interaction ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const text = inputValue;
    setInputValue("");
    addChatMessage("主播", text, false, '#FFFFFF', true);
    setTimeout(async () => {
        const comments = await generateViewerComments(text);
        let delay = 300;
        comments.forEach((comment) => {
          setTimeout(() => {
            const randomUser = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
            const randomColor = VIEWER_COLORS[Math.floor(Math.random() * VIEWER_COLORS.length)];
            addChatMessage(randomUser, comment, false, randomColor);
            if(Math.random() > 0.5) triggerHeart();
          }, delay);
          delay += Math.floor(Math.random() * 800) + 400;
        });
    }, 200);
  };

  const triggerAIInteractions = async () => {
    addChatMessage("系统", "正在生成热度...", true);
    const comments = await generateViewerComments("主播正在求关注，求互动，求点赞");
    let delay = 500;
    comments.forEach((comment) => {
      setTimeout(() => {
        const randomUser = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
        const randomColor = VIEWER_COLORS[Math.floor(Math.random() * VIEWER_COLORS.length)];
        addChatMessage(randomUser, comment, false, randomColor);
        triggerHeart();
      }, delay);
      delay += Math.floor(Math.random() * 1000) + 300;
    });
  };

  const addChatMessage = (username: string, message: string, isSystem = false, color = '#FFFFFF', isHost = false) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(),
      username,
      message,
      color,
      isSystem,
      isHost
    };
    setChatMessages((prev) => [...prev, newMessage].slice(-50));
  };

  const triggerHeart = () => {
    const newHeart: FloatingHeart = {
      id: Date.now() + Math.random(),
      left: 50 + (Math.random() * 40 - 20),
      color: VIEWER_COLORS[Math.floor(Math.random() * VIEWER_COLORS.length)]
    };
    setHearts((prev) => [...prev, newHeart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter(h => h.id !== newHeart.id));
    }, 2000);
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
        
        {/* Main Video Display (Direct) */}
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${cameraEnabled ? 'opacity-100' : 'opacity-0'} ${isScreenSharing ? 'object-contain bg-gray-900' : 'object-cover'}`}
        />

        {!cameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <VideoOff size={64} />
          </div>
        )}

        {/* UI Overlay Layer */}
        <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none">
          
          {/* Header */}
          <div className="flex justify-between items-start pointer-events-auto mt-2">
            {/* User Profile */}
            <div className="flex items-center space-x-2 bg-black/20 backdrop-blur-md rounded-full p-1 pr-4 border border-white/10">
              <div className="relative">
                <img 
                  src="https://picsum.photos/100/100" 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full border border-[#FF0055]"
                />
                <div className="absolute -bottom-1 -right-1 bg-[#FF0055] rounded-full p-0.5">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">直播达人</span>
                <span className="text-[10px] text-gray-300 leading-tight">ID: 888888</span>
              </div>
              <button className="bg-[#FF0055] text-white text-xs font-bold px-3 py-1 rounded-full hover:bg-red-600 transition ml-1">
                关注
              </button>
            </div>

            {/* Viewer Count & Heat */}
            <div className="flex flex-col items-end space-y-1">
               <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                    <User size={12} className="text-white/80" />
                    <span className="text-xs font-bold">{viewerCount}</span>
                </div>
                <button className="p-1 rounded-full bg-black/20 backdrop-blur-md hover:bg-black/40">
                    <X size={20} className="text-white" />
                </button>
               </div>
               <div className="flex items-center space-x-1 bg-gradient-to-r from-orange-500/80 to-red-500/80 backdrop-blur-md px-2 py-0.5 rounded-full shadow-lg">
                    <Flame size={10} className="text-yellow-200 fill-yellow-200" />
                    <span className="text-[10px] font-bold text-white">{heatCount}w</span>
               </div>
            </div>
          </div>

          {/* Right Sidebar Actions */}
          <div className="absolute right-4 bottom-24 flex flex-col items-center space-y-4 pointer-events-auto">
             
             {/* One-Click Screen Record */}
             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={handleScreenRecord}
                   className="p-3 bg-red-600/90 backdrop-blur-md rounded-full hover:bg-red-500 active:scale-95 transition shadow-lg shadow-red-500/20"
                >
                  <MonitorUp size={28} className="text-white" />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">一键录屏</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleSource}
                   className={`p-3 backdrop-blur-md rounded-full active:scale-95 transition ${isScreenSharing ? 'bg-blue-600/80 hover:bg-blue-500' : 'bg-black/20 hover:bg-black/40'}`}
                >
                  {isScreenSharing ? <RefreshCw size={28} /> : <Monitor size={28} />}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">{isScreenSharing ? '切回镜头' : '屏幕共享'}</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleCamera}
                   className={`p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition`}
                >
                  {cameraEnabled ? <Video size={28} /> : <VideoOff size={28} className="text-red-500"/>}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">画面</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                   onClick={toggleMic}
                   className="p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition"
                >
                  {micEnabled ? <Mic size={28} /> : <MicOff size={28} className="text-red-500"/>}
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">麦克风</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                  onClick={triggerAIInteractions}
                  className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full hover:brightness-110 active:scale-95 transition shadow-lg shadow-purple-500/30"
                >
                  <Sparkles size={28} />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">热场</span>
             </div>

             <div className="flex flex-col items-center space-y-1">
                <button 
                  onClick={() => {
                      triggerHeart();
                      setHeatCount(prev => parseFloat((prev + 0.01).toFixed(2)));
                  }}
                  className="p-3 bg-black/20 backdrop-blur-md rounded-full hover:bg-black/40 active:scale-95 transition"
                >
                  <Heart size={28} className={hearts.length > 0 ? "fill-red-500 text-red-500" : ""} />
                </button>
                <span className="text-[10px] font-medium shadow-black drop-shadow-md text-white/90">点赞</span>
             </div>
          </div>

          {/* Bottom Area: Chat */}
          <div className="flex flex-col space-y-2 mb-2 pointer-events-auto w-full">
            
            {/* Chat Overlay */}
            <div className="relative w-full">
               <LiveChat messages={chatMessages} />
            </div>

            {/* Bottom Controls Bar */}
            <div className="flex items-center justify-between px-2 pt-2 pb-4">
              
              <form onSubmit={handleSendMessage} className="flex-1 flex items-center relative mr-3">
                 <div className="absolute left-3 text-white/70">
                    <MessageCircle size={18} />
                 </div>
                 <input 
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="说点什么..."
                    className="w-full bg-black/30 backdrop-blur-md rounded-full h-10 pl-10 pr-10 border border-white/10 focus:border-white/40 focus:bg-black/50 transition outline-none text-sm text-white placeholder-white/50"
                 />
                 {inputValue.trim() && (
                     <button type="submit" className="absolute right-2 p-1 bg-[#FF0055] rounded-full hover:scale-105 transition">
                        <Send size={14} className="text-white ml-0.5" />
                     </button>
                 )}
              </form>

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

              <button className="ml-3 p-2 rounded-full hover:bg-white/10 transition">
                <Settings size={24} />
              </button>

            </div>
          </div>
        </div>

        <FloatingHearts hearts={hearts} />

      </div>
    </div>
  );
};

export default App;