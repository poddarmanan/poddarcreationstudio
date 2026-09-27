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

What a model needs: UV coordinates (the weave tiles across them), **a single garment with no
mannequin or hanger baked in** — the whole file is re-dressed as cloth, so a torso modelled
into the same mesh comes out wearing the fabric too — and ideally under ~10 MB, since it is
downloaded by every visitor who opens the cut. Draco-compressed files are fine; the decoder is
served from `/draco/`. The studio adds its own black dress form under every cut.

Size: run `node scripts/slim-model.mjs public/models/<cut>.glb` after adding a file. It drops the
textures the model shipped with (the studio never draws them; they are usually most of the
file) — the top went from 13.8 MB to 0.4 MB. For a heavy mesh, Draco compression on top of that
(`npx @gltf-transform/cli draco in.glb out.glb`) took the t-shirt from 10.9 MB to 0.7 MB.

Sleeves: a model saved with its arms bent or held out has them let down to hang, **if each
sleeve is its own mesh** (as `shirt.glb` is). A model saved as arbitrary chunks (`tshirt.glb`)
keeps its sleeves as modelled — when exporting, keep sleeves as separate objects.

A model whose texture cuts parts away (transparent texels, alpha mode BLEND or MASK) keeps that
cut-out; the studio's cloth honours it and measures the garment from the visible vertices only.

Licences: models from Sketchfab and similar carry a licence (commonly CC-BY, which requires
naming the author). Keep the attribution here, one line per model, before publishing.

What is in place now: `shirt.glb` (a poplin shirt saved arms-down, as four chunks, so its
sleeves hang as modelled), `kurti.glb` (a kurta with palazzo, one mesh in three pieces, scaled
together to the kurti's height), `top.glb` and `tshirt.glb` — all stripped of their textures and
Draco-compressed, between 0.4 and 1.3 MB each.

## Attribution

<!-- kurti.glb — "Title" by Author, licence, URL -->
