# Garment models

Put one glTF binary per cut here and the Fabric Lab uses it instead of the built-in silhouette.
Nothing else to configure — remove the file and the cut falls back.

| Cut | File |
|---|---|
| Kurti | `kurti.glb` |
| Shirt | `shirt.glb` |
| Dress | `dress.glb` |
| Top | `top.glb` |
| T-Shirt | `tshirt.glb` |

What happens to a model: its own materials are thrown away and every surface is re-dressed in
the studio's fabric material, so the cloth, the shade and the light are the studio's. It is
scaled to a garment's real height (about 1.15 m) and centred, whatever units it was built in.

What a model needs: UV coordinates (the weave tiles across them), a single garment with no
mannequin or hanger baked in, and ideally under ~10 MB — it is downloaded by every visitor who
opens the cut. Draco-compressed files are fine; the decoder is served from `/draco/`.

Licences: models from Sketchfab and similar carry a licence (commonly CC-BY, which requires
naming the author). Keep the attribution here, one line per model, before publishing.

## Attribution

<!-- kurti.glb — "Title" by Author, licence, URL -->
