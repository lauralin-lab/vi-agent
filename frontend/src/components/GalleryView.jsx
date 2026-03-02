import { motion } from 'framer-motion';
import { ChevronDown, ImageOff } from 'lucide-react';

export default function GalleryView({ isOpen, onClose, onSelect, photos = [] }) {
    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: isOpen ? '0%' : '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-black flex flex-col pt-12 rounded-t-3xl overflow-hidden"
            style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        >
            {/* Handle Bar & Header */}
            <div className="w-full flex flex-col items-center bg-zinc-900 pb-4 pt-2">
                <div className="w-12 h-1.5 bg-zinc-700/50 rounded-full mb-4" />
                <div className="w-full px-6 flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
                    >
                        <ChevronDown size={24} />
                    </button>
                    <span className="text-white font-semibold" style={{ fontSize: 'var(--text-lg)' }}>Recents</span>
                    <div className="w-10" /> {/* Spacer for balance */}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto bg-black p-1">
                {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-0.5">
                        {photos.map((photo, i) => (
                            <div
                                key={photo.id ?? i}
                                onClick={() => onSelect(photo.src)}
                                className="aspect-square w-full cursor-pointer hover:opacity-90 transition-opacity active:scale-95 relative overflow-hidden"
                            >
                                <img src={photo.src} alt="" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-white/30">
                        <ImageOff size={48} className="mb-3 opacity-40" />
                        <p style={{ fontSize: 'var(--text-sm)' }}>No photos yet</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
