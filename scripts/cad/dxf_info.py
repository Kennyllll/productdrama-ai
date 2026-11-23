"""工厂 2D 图纸（DXF）→ 尺寸清单 + 预览图。
usage: python dxf_info.py <in.dxf> <out.png>
打印一行 JSON：{ok, units, extents_mm, dims: [{kind, value_mm, text}]}
"""
import json, re, sys

UNIT_MM = {0: 1.0, 1: 25.4, 2: 304.8, 4: 1.0, 5: 10.0, 6: 1000.0, 14: 100.0}


def main():
    src, out = sys.argv[1], sys.argv[2]
    import ezdxf
    from ezdxf import bbox, recover

    try:
        doc = ezdxf.readfile(src)
    except Exception:
        doc, _ = recover.readfile(src)
    units = int(doc.header.get("$INSUNITS", 0))
    k = UNIT_MM.get(units, 1.0)
    msp = doc.modelspace()
    dims = []
    for d in msp.query("DIMENSION"):
        t = d.dimtype & 7
        kind = {0: "linear", 1: "aligned", 3: "diameter", 4: "radius"}.get(t)
        if not kind:
            continue
        if kind == "linear":
            ang = round(float(d.dxf.get("angle", 0.0))) % 180
            kind = "horizontal" if ang == 0 else "vertical" if ang == 90 else "linear"
        txt = (d.dxf.get("text", "") or "").strip()
        val = None
        if txt and txt != "<>":
            m = re.search(r"\d+(?:\.\d+)?", txt.replace(",", "."))
            if m:
                val = float(m.group(0))
        if val is None:
            try:
                val = float(d.get_measurement()) * k
                try:
                    from ezdxf.entities import DimStyleOverride

                    val *= float(DimStyleOverride(d).get("dimlfac", 1.0) or 1.0)
                except Exception:
                    pass
            except Exception:
                continue
        if val and val > 0:
            dims.append({"kind": kind, "value_mm": round(val, 1), "text": txt})
    ext = bbox.extents(msp)
    size = [round((ext.extmax[i] - ext.extmin[i]) * k, 1) for i in (0, 1)] if ext.has_data else [0, 0]

    import matplotlib

    matplotlib.use("Agg")
    from ezdxf.addons.drawing import matplotlib as draw

    draw.qsave(msp, out, bg="#FFFFFF", dpi=120)
    print(json.dumps({"ok": True, "units": units, "extents_mm": size, "dims": dims[:200]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)[:300]}))
        sys.exit(1)
