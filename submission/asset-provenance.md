# Visual asset provenance

The reference and defective steel-flange images were created using the built-in ImageGen tool for this project. They are synthetic illustrations for UI testing, not real industrial specimens. The demo heatmap is an illustrative transparent SVG located beside those images. It is not a model output.

Reference prompt: “Photorealistic top-down studio inspection reference of a clean precision machined circular steel bearing housing, concentric machining marks, four bolt holes, dark central bore, charcoal matte inspection table, cool diffuse lighting, square framing. No labels or heatmap.”

Defect edit prompt: “Preserve the same camera, shape, framing and lighting. Add one deep diagonal gouge on the outer silver flange at two o'clock between the top-right bolt hole and right edge. No other defects or overlays.”

The cover (`worksight-cover.png`) and the deck's cover slide use "Production Line of Computer Elements" by Andrey Matveev (https://www.pexels.com/photo/production-line-of-computer-elements-5554948/, Pexels License, credited on the slide). It is a generic production line, not a Worksight customer or deployment.

The other deck slides use VisA pcb1 images (the 20 profile references and the bent-pins test image below) and read-only screenshots of the live app, including its real heatmap and saved Gemma report.

The submission video `worksight-demo.mp4` uses the same cover photo, the VisA images and screen
recordings of the live app; its voice-over is a synthesized neural voice reading `demo-script.md`.

Workspace screenshots show the actual implemented interface in demo mode. No picture or screenshot proves AMD inference, accuracy or performance.

## Live example images

`web/public/examples/visa-pcb1-normal-0011.jpg` and `visa-pcb1-bent-014.jpg` are unmodified copies of
`pcb1/Data/Images/Normal/0011.JPG` and `pcb1/Data/Images/Anomaly/014.JPG` (bent pins) from the official
VisA test split ([Zou et al., ECCV 2022](https://github.com/amazon-science/spot-diff), Amazon, CC BY 4.0).
They are not among the 20 profile references. With the benchmark profile they score 0.059 (normal) and
0.211 (anomaly) against a 0.121 threshold, matching `data/evidence/visa-cpu/pcb1.json`.
