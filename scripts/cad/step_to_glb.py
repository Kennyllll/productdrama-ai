"""STEP (.step/.stp) → GLB，本机 OpenCASCADE，免费不联网。保留工厂文件里的零件名和颜色。
usage: python step_to_glb.py <in.step> <out.glb> [z|y]（STEP 里朝上的轴，默认 z）
stdout 最后一行 JSON：{"ok":true,"size_m":[x,y,z],"parts":n,"colored":n,"names":[...]} 或 {"ok":false,"error":"..."}
"""
import json, sys


def main():
    src, out = sys.argv[1], sys.argv[2]
    up = sys.argv[3] if len(sys.argv) > 3 else "z"
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.Bnd import Bnd_Box
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.Message import Message_ProgressRange
    from OCP.Quantity import Quantity_Color
    from OCP.RWGltf import RWGltf_CafWriter
    from OCP.RWMesh import RWMesh_CoordinateSystem
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
    try:
        from OCP.TColStd import TColStd_IndexedDataMapOfStringString as FileInfo
    except ImportError:
        from OCP.OCP.collections import IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString as FileInfo
    try:
        from OCP.TDF import TDF_LabelSequence
    except ImportError:  # OCP 8 把容器挪到了 OCP.OCP.collections
        from OCP.OCP.collections import Sequence_TDF_Label as TDF_LabelSequence
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_ColorType, XCAFDoc_DocumentTool

    doc = TDocStd_Document(TCollection_ExtendedString("pd"))
    r = STEPCAFControl_Reader()
    r.SetColorMode(True)
    r.SetNameMode(True)
    r.SetLayerMode(True)
    if r.ReadFile(src) != IFSelect_RetDone:
        raise RuntimeError("读不了这个 STEP 文件：请让工厂重新导出 STEP AP214 或 AP242")
    if not r.Transfer(doc):
        raise RuntimeError("STEP 里没有可用的实体")
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    free = TDF_LabelSequence()
    st.GetFreeShapes(free)
    if free.Length() == 0:
        raise RuntimeError("STEP 里没有形状")
    box = Bnd_Box()
    for i in range(1, free.Length() + 1):
        BRepBndLib.Add_s(st.GetShape_s(free.Value(i)), box)
    a, b = box.CornerMin(), box.CornerMax()
    x0, y0, z0, x1, y1, z1 = a.X(), a.Y(), a.Z(), b.X(), b.Y(), b.Z()
    diag = ((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) ** 0.5
    if diag <= 0:
        raise RuntimeError("STEP 形状大小为 0")
    for i in range(1, free.Length() + 1):
        BRepMesh_IncrementalMesh(st.GetShape_s(free.Value(i)), diag * 0.0006, False, 0.3, True)

    parts, colored, names = 0, 0, []
    allp = TDF_LabelSequence()
    st.GetShapes(allp)
    col = Quantity_Color()
    for i in range(1, allp.Length() + 1):
        lab = allp.Value(i)
        if not st.IsSimpleShape_s(lab):
            continue
        parts += 1
        if any(ct.GetColor(st.GetShape_s(lab), t, col) for t in (XCAFDoc_ColorType.XCAFDoc_ColorSurf, XCAFDoc_ColorType.XCAFDoc_ColorGen)):
            colored += 1
        nm = TDataStd_Name()
        try:
            if len(names) < 200 and lab.FindAttribute(TDataStd_Name.GetID_s(), nm):
                names.append(nm.Get().ToExtString())
        except Exception:  # noqa: BLE001 名字只是给人看的
            pass

    # 工厂 CAD 一般是毫米；输出 glTF 是米、Y 朝上（躺着的在审核页一键换朝上的轴）
    w = RWGltf_CafWriter(TCollection_AsciiString(out), True)
    conv = w.ChangeCoordinateSystemConverter()
    conv.SetInputLengthUnit(0.001)
    conv.SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup if up == "y" else RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup)
    if not w.Perform(doc, FileInfo(), Message_ProgressRange()):
        raise RuntimeError("转换 GLB 失败")
    s = [round((x1 - x0) / 1000, 4), round((y1 - y0) / 1000, 4), round((z1 - z0) / 1000, 4)]
    print(json.dumps({"ok": True, "size_m": s, "parts": parts, "colored": colored, "names": names}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)
