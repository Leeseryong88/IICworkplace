import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Download, Layout, Sparkles, AlertCircle } from 'lucide-react';
import { PosterPreview } from './components/PosterPreview';
import { PosterEditor } from './components/PosterEditor';
import { INITIAL_POSTER_CONTENT, PosterContent } from './types';
import { generateSafetyCopy, recommendIcons } from './aiService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function App() {
  const [content, setContent] = useState<PosterContent>(INITIAL_POSTER_CONTENT);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = (data: Partial<PosterContent>) => {
    setContent(prev => ({ ...prev, ...data }));
  };

  const handleAiGenerate = async (context: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const suggestedData = await generateSafetyCopy(context);
      const updatedContent = { ...content, ...suggestedData };
      
      // Recommend icons for the core actions
      const icons = await recommendIcons(updatedContent.coreActions);
      updatedContent.coreActions = updatedContent.coreActions.map((action, i) => ({
        ...action,
        iconName: icons[i] || 'AlertCircle'
      }));

      setContent(updatedContent);
    } catch (err: any) {
      console.error(err);
      setError("AI 문구 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportPdf = async () => {
    const element = document.getElementById('safety-poster');
    if (!element) return;

    setIsProcessing(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`safety_poster_${Date.now()}.pdf`);
    } catch (err) {
      console.error(err);
      setError("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F2F2F2]">
      <main className="flex-1 overflow-auto p-12 flex flex-col items-center">
        {/* Preview Panel (The Workspace Canvas) */}
        <div className="w-full max-w-4xl space-y-6">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-black/40 italic">워크스페이스 // 프리뷰_01</h2>
            <div className="flex items-center gap-4 text-[0.6rem] font-bold text-black/60 uppercase">
              <span>확대 비율: 92%</span>
              <span>레이어: 루트</span>
            </div>
          </div>
          <div className="bg-[#EAEAEA] p-12 border-2 border-dashed border-black/10 flex items-center justify-center min-h-[800px]">
            <div className="relative group">
              <PosterPreview content={content} />
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setIsEditorOpen(true)}
                  className="bg-black text-white px-6 py-2 font-black uppercase text-[0.6rem] tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all shadow-xl flex items-center gap-2"
                >
                  <Plus className="w-3 h-3" />
                  에디터 열기
                </button>
                <button 
                  onClick={handleExportPdf}
                  disabled={isProcessing}
                  className="bg-black text-white px-6 py-2 font-black uppercase text-[0.6rem] tracking-widest hover:bg-white hover:text-black border-2 border-black transition-all shadow-xl flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-3 h-3" />
                  PDF 내보내기
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Editor Modal */}
      <PosterEditor 
        content={content}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onUpdate={handleUpdate}
        onAiGenerate={handleAiGenerate}
        isProcessing={isProcessing}
      />

      {/* Error Toast */}
      {error && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-10 flex items-center gap-3 bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl z-[100]"
        >
          <AlertCircle className="w-6 h-6" />
          <span className="font-bold">{error}</span>
        </motion.div>
      )}

      {/* Processing Overlay (Global) */}
      {isProcessing && (
        <div className="fixed inset-0 z-[200] bg-white/20 backdrop-blur-[2px] cursor-wait pointer-events-none" />
      )}
    </div>
  );
}

// Re-using same Icon component in App for consistency in imports if needed, but not used here.
import * as Icons from 'lucide-react';
const Image = Icons.Image;

