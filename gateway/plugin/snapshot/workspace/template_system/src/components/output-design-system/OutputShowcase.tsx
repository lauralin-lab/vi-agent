import React from 'react';
import { MapOutput } from './MapOutput';
import { ProductListOutput } from './ProductListOutput';
import { SlideDeckOutput } from './SlideDeckOutput';
import { MusicPlayerOutput } from './MusicPlayerOutput';
import { MindMapOutput } from './MindMapOutput';
import { TextOutput } from './TextOutput';
import { CodeOutput } from './CodeOutput';
import { TableOutput } from './TableOutput';
import { AudioOutput } from './AudioOutput';
import { InteractivePlaygroundOutput } from './InteractivePlaygroundOutput';

export function OutputShowcase() {
    return (
        <div className="p-4 space-y-8 min-h-screen pb-24">

            <div className="space-y-12">

                {/* Interactive Web */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Live 3D Map</h2>
                    <InteractivePlaygroundOutput
                        type="iframe"
                        src="https://minitokyo3d.com/"
                        className="h-[500px]"
                        title="Mini Tokyo 3D"
                        bordered={false}
                    />
                </section>

                {/* Audio Snippets */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Audio Snippets</h2>
                    <AudioOutput
                        snippets={[
                            { id: '1', text: '6番、ひとつください', duration: '0:02' },
                            { id: '2', text: 'これ、ひとつ', duration: '0:01' },
                            { id: '3', text: '29番、ください', duration: '0:03' },
                        ]}
                    />
                </section>

                {/* Music */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Music Player</h2>
                    <MusicPlayerOutput
                        track={{
                            title: "Midnight City",
                            artist: "M83",
                            album: "Hurry Up, We're Dreaming",
                            duration: 243,
                            coverArt: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?ixlib=rb-1.2.1&auto=format&fit=crop&w=1400&q=80",
                            src: ""
                        }}
                        playlist={[
                            { title: "Midnight City", artist: "M83", duration: 243 },
                            { title: "Levels", artist: "Avicii", duration: 198 },
                            { title: "Get Lucky", artist: "Daft Punk", duration: 248 },
                        ]}
                    />
                </section>

                {/* Table */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Menu Table</h2>
                    <TableOutput
                        title="招牌廣島燒 (いちおし広島焼き)"
                        columns={[
                            { header: '編號', accessorKey: 'id' },
                            { header: '菜名', accessorKey: 'name' },
                            { header: '價格', accessorKey: 'price' },
                            { header: '說明', accessorKey: 'desc' },
                        ]}
                        data={[
                            { id: '1', name: '牛筋九条葱玉', price: '¥1,640', desc: '牛筋+京都九条葱+豬肉' },
                            { id: '2', name: '牛筋九条葱蛋包', price: '¥1,780', desc: '同上，外面包薄蛋皮' },
                            { id: '3', name: '蝦玉', price: '¥1,690', desc: '蝦+豬肉' },
                        ]}
                    />
                </section>

                {/* Text */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Rich Text</h2>
                    <TextOutput
                        title="Okay"
                        content={`We were just walking past the usual corner store,
But my mind was already somewhere I can't stand in anymore.
I started talking about autumn out of nowhere—
Beijing last year, ginkgo and wax trees, leaves spinning in hutong air.

And you said, "I was thinking," stopping by the curb,
"Ever since the clocks went back, time isn't real. It's just a blurry word."`}
                    />
                </section>

                {/* Products */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Vertical Product List</h2>
                    <ProductListOutput
                        products={[
                            { id: '1', name: 'H&M Puffer Jacket', price: '$84.99', imageSrc: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80', description: 'Puffer Jacket with Collar' },
                            { id: '2', name: 'Zara Hooded Down', price: '$77.40', imageSrc: 'https://images.unsplash.com/photo-1544923246-77307dd654cb?w=800&q=80', description: 'Water Repellent Windproof Hooded Down' },
                            { id: '3', name: 'Ralph Lauren', price: '$119.00', imageSrc: 'https://images.unsplash.com/photo-1551488852-d81a4d9859c5?w=800&q=80', description: 'Short puffer jacket' },
                        ]}
                    />
                </section>

                {/* Map */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Map Card</h2>
                    <MapOutput
                        location={{
                            lat: 37.7749,
                            lng: -122.4194,
                            name: "Reynisfjara Beach",
                            address: "Vik, Iceland"
                        }}
                    />
                </section>

                {/* Slides */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Slide Deck</h2>
                    <SlideDeckOutput
                        slides={[
                            { type: 'image', src: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80', title: 'Office Design' },
                            { type: 'text', title: 'Q4 Strategy', content: 'Our focus for Q4 includes optimizing the output design system.' }
                        ]}
                    />
                </section>

                {/* MindMap */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">FigJam Canvas</h2>
                    <MindMapOutput
                        nodes={[
                            { id: '1', label: 'Main Idea', type: 'root', x: 0, y: 0 },
                            { id: '2', label: 'Concept A', x: 100, y: 100 },
                            { id: '3', label: 'Concept B', x: -100, y: 100 },
                        ]}
                        edges={[
                            { id: 'e1-2', source: '1', target: '2' },
                            { id: 'e1-3', source: '1', target: '3' },
                        ]}
                    />
                </section>

                {/* Code */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Code Snippet</h2>
                    <CodeOutput
                        code={`function hello() {
  console.log("Hello, World!");
}`}
                        language="typescript"
                    />
                </section>

            </div>
        </div>
    );
}
