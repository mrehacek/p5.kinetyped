/**
 * p5.kinetyped library by Marko Rehacek, 2022
 */

// TODO: constant rate interpolation for curves

import opentype from "opentype.js";
import p5 from "p5";

export type Vec2D = {
  x: number;
  y: number;
};

export type KT_Glyph = {
  shape: p5.Vector[];
  contour: p5.Vector[];
  all: p5.Vector[];
};

//let canvas: p5, ctx: any;
let font: opentype.Font;
let glyphs: opentype.Path[];
let text_width: number;
let points_all: p5.Vector[] = [];
let points_separated: KT_Glyph[] = [];

/**
 * Load a font from URL asynchronously. Use in p5's preload function.
 * @param fontPath Path to font file
 */
export async function loadFont(fontPath: string) {
  if (typeof fontPath != "string") {
    throw new Error("[p5.kinetyped] loadFont(fontPath): fontPath must be a string.");
  }

  try {
    font = await opentype.load(fontPath);
    if (!font) throw new Error("Invalid font file.");
  } catch (e) {
    console.error(e);
  }
}

/**
 * Generate glyph paths from text in given size using the loaded font.
 * @param x origin position in x axis
 * @param y origin position in y axis
 * @param fontSize in pixels
 * @param text input for glyphs
 * @returns generated glyphs (opentype.Path[])
 */
export async function generateGlyphs(x: number, y: number, fontSize: number, text: string): Promise<opentype.Path[]> {
  if (typeof x != "number" || typeof y != "number" || typeof fontSize != "number" || typeof text != "string") {
    throw new Error(
      "[p5.kinetyped] generateGlyphs(x: number, y: number, fontSize: number, text: string): invalid parameters."
    );
  }

  text_width = font.getAdvanceWidth(text, fontSize);
  if (!font) throw new Error("[p5.kinetyped] generateGlyphs(): Font wasn't loaded yet. Glyphs can't be generated.");
  glyphs = await font.getPaths(text, x, y, fontSize);
  if (!glyphs) {
    throw new Error("[p5.kinetyped] generateGlyphs(): Glyphs couldn't be generated.");
  }
  return glyphs;
}

export function interpolateGlyphs(resolution: number) {
  ({ points_all, points_separated } = interpolate_glyphs(glyphs, resolution, null));
}

export function getPoints(): p5.Vector[] {
  return points_all;
}

export function getSeparatedPoints(): KT_Glyph[] {
  return points_separated;
}

export function getWidth(): number {
  return text_width;
}

function interpolate_line(unit_length: number, p0: Vec2D, p1: Vec2D): p5.Vector[] {
  const points = [];
  let v1 = new p5.Vector(p0.x, p0.y);
  let v2 = new p5.Vector(p1.x, p1.y);
  const length = v2.dist(v1);
  const num_points = Math.floor(length / unit_length);
  for (let i = 0; i < num_points; i++) {
    let pp = p5.Vector.lerp(v1, v2, i / num_points);
    points.push(pp);
  }
  return points;
}

function quadratic_lerp(v0: p5.Vector, v1: p5.Vector, v2: p5.Vector, t: number): p5.Vector {
  return p5.Vector.lerp(p5.Vector.lerp(v0, v1, t), p5.Vector.lerp(v1, v2, t), t);
}

function interpolate_bezier_quadratic(unit_length: number, p0: Vec2D, p1: Vec2D, p2: Vec2D): p5.Vector[] {
  const points: p5.Vector[] = [];
  let v0 = new p5.Vector(p0.x, p0.y);
  let v1 = new p5.Vector(p1.x, p1.y);
  let v2 = new p5.Vector(p2.x, p2.y);
  // P(t) = P0*(1-t)^2 + P1*2*(1-t)*t + P2*t^2

  const length = 30;
  // TODO: calculate quadratic bezier arc length
  /*
      https://stackoverflow.com/questions/1074395/quadratic-bezier-interpolation
      Usually, a common method to traverse a parametric curve at constant-speed is to reparametrize by arc-length. 
      This means expressing P as P(s) where s is the length traversed along the curve. 
      Obviously, s varies from zero to the total length of the curve. In the case of a quadratic bezier curve, 
      there's a closed-form solution for the arc-length as a function of t, but it's a bit complicated. 
      Computationally, it's often faster to just integrate numerically using your favorite method. 
      Notice however that the idea is to compute the inverse relation, that is, t(s), so as to express P as P(t(s)). 
      Then, choosing evenly-spaced s will produce evenly-space P.
      */
  const num_points = Math.floor(length / unit_length);
  for (let i = 0; i < num_points; i++) {
    let t = i / num_points;
    let pp = quadratic_lerp(v0, v1, v2, t);
    points.push(pp);
  }
  return points;
}

/**
 * Interpolate (rasterize) font paths to get points
 * @param glyphs to interpolate
 * @param interpolation_resolution eg. if set to 3, every 3 pixels on a curve will be a point
 * @param vis_buf optionally draw control points to this buffer for debug, clears this buffer before drawing
 * @returns uniformly distributed points along the paths of the glyphs
 */
function interpolate_glyphs(
  glyphs: opentype.Path[],
  interpolation_resolution: number,
  vis_buf: p5.Graphics | null = null
): {
  points_all: p5.Vector[];
  points_separated: KT_Glyph[];
} {
  let points_all: p5.Vector[] = [];
  let points_separated = [];
  let pos = { x: 0, y: 0 };
  let contouring = false;
  if (vis_buf) {
    console.log("[p5.kinetyped] Visualizing interpolation in canvas.");
    // @ts-expect-error
    vis_buf.clear();
  }

  for (const glyph of glyphs) {
    let curr_points: p5.Vector[] = [];
    let curr_glyph: KT_Glyph = { shape: [], contour: [], all: [] };

    let first_cmd = true;
    for (const cmd of glyph.commands) {
      switch (cmd.type) {
        case "M": {
          if (!contouring && !first_cmd) {
            curr_glyph.all = curr_glyph.all.concat(curr_points);
            curr_glyph.shape = curr_points;
            curr_points = [];
            contouring = true;
          } else {
            curr_glyph.contour.concat(curr_points);
          }
          pos = { x: cmd.x, y: cmd.y };
          first_cmd = false;
          break;
        }
        case "L": {
          curr_points = curr_points.concat(interpolate_line(interpolation_resolution, pos, cmd));
          pos = { x: cmd.x, y: cmd.y };
          if (vis_buf) {
            vis_buf.vertex(cmd.x, cmd.y);
            visualize_vertex(vis_buf, pos);
          }
          break;
        }
        case "C": {
          console.error("Cubic bezier is not supported yet.");
          pos = { x: cmd.x, y: cmd.y };
          break;
        }
        case "Q": {
          const v1 = { x: cmd.x1, y: cmd.y1 };
          curr_points = curr_points.concat(interpolate_bezier_quadratic(interpolation_resolution, pos, v1, cmd));
          pos = { x: cmd.x, y: cmd.y };
          vis_buf ? visualize_bezier_point(vis_buf, cmd) : null;
          break;
        }
      }
    }
    // all comands of the glyph are processed
    if (contouring) {
      curr_glyph.contour = curr_points;
    } else {
      curr_glyph.shape = curr_points;
    }
    curr_glyph.all = curr_glyph.all.concat(curr_points);
    contouring = false;
    points_separated.push(curr_glyph);
    points_all = points_all.concat(curr_glyph.shape.concat(curr_glyph.contour));
  }
  return { points_separated, points_all };
}

function visualize_vertex(p: p5, pos: Vec2D) {
  p.push();
  p.fill(220, 100, 100);
  p.noStroke();
  p.circle(pos.x, pos.y, 5);
  p.pop();
}

function visualize_bezier_point(p: p5, cmd: opentype.PathCommand) {
  if (cmd.type != "Q") return;
  p.quadraticVertex(cmd.x1, cmd.y1, cmd.x, cmd.y);
  p.push();
  p.fill(20, 100, 100);
  p.noStroke();
  p.circle(cmd.x1, cmd.y1, 3);
  p.fill(220, 100, 100);
  p.circle(cmd.x, cmd.y, 3);
  p.pop();
}
