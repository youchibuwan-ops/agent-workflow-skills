"""Optional Blender 4.5 case inspection; never saves source geometry."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
scene = bpy.context.scene
dependency_graph = bpy.context.evaluated_depsgraph_get()
names = ["continuous-spring-sheet", "N-handle-hypothesis", "F-handle-hypothesis"]
trees, records = {}, {}
for name in names:
    obj = bpy.data.objects[name]
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dependency_graph))
    mesh.calc_loop_triangles()
    vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    triangles = [tuple(triangle.vertices) for triangle in mesh.loop_triangles]
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    triangle_sets = [set(triangle) for triangle in triangles]
    self_hits = [(a, b) for a, b in tree.overlap(tree)
                 if a < b and not triangle_sets[a].intersection(triangle_sets[b])]
    parent = list(range(len(vertices)))

    def find(vertex):
        while parent[vertex] != vertex:
            parent[vertex] = parent[parent[vertex]]
            vertex = parent[vertex]
        return vertex

    edge_faces = {}
    for polygon in mesh.polygons:
        indices = list(polygon.vertices)
        for a, b in zip(indices, indices[1:] + indices[:1]):
            parent[find(a)] = find(b)
            key = tuple(sorted((a, b)))
            edge_faces[key] = edge_faces.get(key, 0) + 1
    record = {"vertices": len(vertices), "faces": len(mesh.polygons),
              "components": len({find(v) for v in range(len(vertices))}),
              "boundary_edges": sum(n == 1 for n in edge_faces.values()),
              "edges_over_two_faces": sum(n > 2 for n in edge_faces.values()),
              "nonadjacent_triangle_intersections": len(self_hits)}
    assert record["components"] == 1 and record["boundary_edges"] == 0
    assert record["edges_over_two_faces"] == 0 and not self_hits
    records[name], trees[name] = record, tree

crossings = {a + " / " + b: len(trees[a].overlap(trees[b]))
             for i, a in enumerate(names) for b in names[i + 1:]}
assert all(n == 0 for n in crossings.values())
report = {"source_sha256": hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
          "scope": "Saved construction at one pose; no visual, precise-dimension, load or motion certification",
          "objects": records, "crossings": crossings, "source_not_saved": True}
print(json.dumps(report, indent=2))
if args.output:
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "geometry-checks.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    scene.render.resolution_x = scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 8
    target = Vector((-2.55, 21, 0))
    for name, direction in [("front", (0, -1, .03)), ("end-section", (1, 0, 0)),
                            ("reverse-volume", (-.65, .5, .55))]:
        view = Vector(direction).normalized()
        right = Vector((0, 0, 1)).cross(view).normalized()
        up = view.cross(right)
        data = bpy.data.cameras.new("inspection-" + name)
        data.type, data.ortho_scale = "ORTHO", 86
        camera = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(camera)
        camera.location = target + 180 * view
        camera.rotation_euler = Matrix((right, up, view)).transposed().to_euler()
        scene.camera, scene.render.filepath = camera, str(output / (name + ".png"))
        bpy.ops.render.render(write_still=True)
