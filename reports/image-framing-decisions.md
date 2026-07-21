# Image framing decisions

The site uses contain-fit image rendering because printable line art must not be cropped. The visual correction therefore changes presentation frames, not artwork files.

| Surface | Before | After | Reason |
| --- | --- | --- | --- |
| Standard collection card | 4:3 | 3:4, maximum 420px high | The verified primary preview is portrait 341 x 512. |
| Compact collection card | 4:3 | 4:5, maximum 280px high | Keeps compact discovery cards short without reverting to a landscape well. |
| Printable gallery card | 3:4 | 2:3, maximum 420px high | Gives portrait artwork more of the frame while preserving all edges. |
| Printable detail preview | Flexible first column | Minimum 360px preview column, centered asset frame | Prevents a thumbnail-like visual treatment while keeping verified image dimensions truthful. |

`object-fit: contain` remains intentional. Some residual white/transparent margin is part of original source canvases and should be reviewed per asset only if an editorially approved crop derivative is created later.
