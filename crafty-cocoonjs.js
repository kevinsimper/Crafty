/**
 * crafty 0.6.1
 * http://craftyjs.com/
 *
 * Copyright 2014, Louis Stowasser
 * Dual licensed under the MIT or GPL licenses.
 */


;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document,
    HashMap = require('./HashMap.js');
// Crafty._rectPool
//
// This is a private object used internally by 2D methods
// Cascade and _attr need to keep track of an entity's old position,
// but we want to avoid creating temp objects every time an attribute is set.
// The solution is to have a pool of objects that can be reused.
//
// The current implementation makes a BIG ASSUMPTION:  that if multiple rectangles are requested,
// the later one is recycled before any preceding ones.  This matches how they are used in the code.
// Each rect is created by a triggered event, and will be recycled by the time the event is complete.
Crafty._rectPool = (function () {
    var pool = [],
        pointer = 0;
    return {
        get: function (x, y, w, h) {
            if (pool.length <= pointer)
                pool.push({});
            var r = pool[pointer++];
            r._x = x;
            r._y = y;
            r._w = w;
            r._h = h;
            return r;
        },

        copy: function (o) {
            if (pool.length <= pointer)
                pool.push({});
            var r = pool[pointer++];
            r._x = o._x;
            r._y = o._y;
            r._w = o._w;
            r._h = o._h;
            return r;
        },

        recycle: function (o) {
            pointer--;
        }
    };
})();


/**@
 * #Crafty.map
 * @category 2D
 * Functions related with querying entities.
 * @see Crafty.HashMap
 */
Crafty.map = new HashMap();
var M = Math,
    Mc = M.cos,
    Ms = M.sin,
    PI = M.PI,
    DEG_TO_RAD = PI / 180;

Crafty.extend({
    zeroFill: function (number, width) {
        width -= number.toString().length;
        if (width > 0)
            return new Array(width + (/\./.test(number) ? 2 : 1)).join('0') + number;
        return number.toString();
    }
});

/**@
 * #2D
 * @category 2D
 * Component for any entity that has a position on the stage.
 * @trigger Move - when the entity has moved - { _x:Number, _y:Number, _w:Number, _h:Number } - Old position
 * @trigger Invalidate - when the entity needs to be redrawn
 * @trigger Rotate - when the entity is rotated - { cos:Number, sin:Number, deg:Number, rad:Number, o: {x:Number, y:Number}}
 */
Crafty.c("2D", {
    /**@
     * #.x
     * @comp 2D
     * The `x` position on the stage. When modified, will automatically be redrawn.
     * Is actually a getter/setter so when using this value for calculations and not modifying it,
     * use the `._x` property.
     * @see ._attr
     */
    _x: 0,
    /**@
     * #.y
     * @comp 2D
     * The `y` position on the stage. When modified, will automatically be redrawn.
     * Is actually a getter/setter so when using this value for calculations and not modifying it,
     * use the `._y` property.
     * @see ._attr
     */
    _y: 0,
    /**@
     * #.w
     * @comp 2D
     * The width of the entity. When modified, will automatically be redrawn.
     * Is actually a getter/setter so when using this value for calculations and not modifying it,
     * use the `._w` property.
     *
     * Changing this value is not recommended as canvas has terrible resize quality and DOM will just clip the image.
     * @see ._attr
     */
    _w: 0,
    /**@
     * #.h
     * @comp 2D
     * The height of the entity. When modified, will automatically be redrawn.
     * Is actually a getter/setter so when using this value for calculations and not modifying it,
     * use the `._h` property.
     *
     * Changing this value is not recommended as canvas has terrible resize quality and DOM will just clip the image.
     * @see ._attr
     */
    _h: 0,
    /**@
     * #.z
     * @comp 2D
     * The `z` index on the stage. When modified, will automatically be redrawn.
     * Is actually a getter/setter so when using this value for calculations and not modifying it,
     * use the `._z` property.
     *
     * A higher `z` value will be closer to the front of the stage. A smaller `z` value will be closer to the back.
     * A global Z index is produced based on its `z` value as well as the GID (which entity was created first).
     * Therefore entities will naturally maintain order depending on when it was created if same z value.
     *
     * `z` is required to be an integer, e.g. `z=11.2` is not allowed.
     * @see ._attr
     */
    _z: 0,
    /**@
     * #.rotation
     * @comp 2D
     * The rotation state of the entity, in clockwise degrees.
     * `this.rotation = 0` sets it to its original orientation; `this.rotation = 10`
     * sets it to 10 degrees clockwise from its original orientation;
     * `this.rotation = -10` sets it to 10 degrees counterclockwise from its
     * original orientation, etc.
     *
     * When modified, will automatically be redrawn. Is actually a getter/setter
     * so when using this value for calculations and not modifying it,
     * use the `._rotation` property.
     *
     * `this.rotation = 0` does the same thing as `this.rotation = 360` or `720` or
     * `-360` or `36000` etc. So you can keep increasing or decreasing the angle for continuous
     * rotation. (Numerical errors do not occur until you get to millions of degrees.)
     *
     * The default is to rotate the entity around its (initial) top-left corner; use
     * `.origin()` to change that.
     *
     * @see ._attr, .origin
     */
    _rotation: 0,
    /**@
     * #.alpha
     * @comp 2D
     * Transparency of an entity. Must be a decimal value between 0.0 being fully transparent to 1.0 being fully opaque.
     */
    _alpha: 1.0,
    /**@
     * #.visible
     * @comp 2D
     * If the entity is visible or not. Accepts a true or false value.
     * Can be used for optimization by setting an entities visibility to false when not needed to be drawn.
     *
     * The entity will still exist and can be collided with but just won't be drawn.
     * @see Crafty.DrawManager.draw, Crafty.DrawManager.drawAll
     */
    _visible: true,

    /**@
     * #._globalZ
     * @comp 2D
     * When two entities overlap, the one with the larger `_globalZ` will be on top of the other.
     * @see Crafty.DrawManager.draw, Crafty.DrawManager.drawAll
     */
    _globalZ: null,

    _origin: null,
    _mbr: null,
    _entry: null,
    _children: null,
    _parent: null,
    _changed: false,

    _defineGetterSetter_setter: function () {
        //create getters and setters using __defineSetter__ and __defineGetter__
        this.__defineSetter__('x', function (v) {
            this._attr('_x', v);
        });
        this.__defineSetter__('y', function (v) {
            this._attr('_y', v);
        });
        this.__defineSetter__('w', function (v) {
            this._attr('_w', v);
        });
        this.__defineSetter__('h', function (v) {
            this._attr('_h', v);
        });
        this.__defineSetter__('z', function (v) {
            this._attr('_z', v);
        });
        this.__defineSetter__('rotation', function (v) {
            this._attr('_rotation', v);
        });
        this.__defineSetter__('alpha', function (v) {
            this._attr('_alpha', v);
        });
        this.__defineSetter__('visible', function (v) {
            this._attr('_visible', v);
        });

        this.__defineGetter__('x', function () {
            return this._x;
        });
        this.__defineGetter__('y', function () {
            return this._y;
        });
        this.__defineGetter__('w', function () {
            return this._w;
        });
        this.__defineGetter__('h', function () {
            return this._h;
        });
        this.__defineGetter__('z', function () {
            return this._z;
        });
        this.__defineGetter__('rotation', function () {
            return this._rotation;
        });
        this.__defineGetter__('alpha', function () {
            return this._alpha;
        });
        this.__defineGetter__('visible', function () {
            return this._visible;
        });
        this.__defineGetter__('parent', function () {
            return this._parent;
        });
        this.__defineGetter__('numChildren', function () {
            return this._children.length;
        });
    },

    _defineGetterSetter_defineProperty: function () {
        Object.defineProperty(this, 'x', {
            set: function (v) {
                this._attr('_x', v);
            },
            get: function () {
                return this._x;
            },
            configurable: true
        });

        Object.defineProperty(this, 'y', {
            set: function (v) {
                this._attr('_y', v);
            },
            get: function () {
                return this._y;
            },
            configurable: true
        });

        Object.defineProperty(this, 'w', {
            set: function (v) {
                this._attr('_w', v);
            },
            get: function () {
                return this._w;
            },
            configurable: true
        });

        Object.defineProperty(this, 'h', {
            set: function (v) {
                this._attr('_h', v);
            },
            get: function () {
                return this._h;
            },
            configurable: true
        });

        Object.defineProperty(this, 'z', {
            set: function (v) {
                this._attr('_z', v);
            },
            get: function () {
                return this._z;
            },
            configurable: true
        });

        Object.defineProperty(this, 'rotation', {
            set: function (v) {
                this._attr('_rotation', v);
            },
            get: function () {
                return this._rotation;
            },
            configurable: true
        });

        Object.defineProperty(this, 'alpha', {
            set: function (v) {
                this._attr('_alpha', v);
            },
            get: function () {
                return this._alpha;
            },
            configurable: true
        });

        Object.defineProperty(this, 'visible', {
            set: function (v) {
                this._attr('_visible', v);
            },
            get: function () {
                return this._visible;
            },
            configurable: true
        });
    },

    init: function () {
        this._globalZ = this[0];
        this._origin = {
            x: 0,
            y: 0
        };

        // offsets for the basic bounding box
        this._bx1 = 0;
        this._bx2 = 0;
        this._by1 = 0;
        this._by2 = 0;

        this._children = [];

        if (Crafty.support.setter) {
            this._defineGetterSetter_setter();
        } else if (Crafty.support.defineProperty) {
            //IE9 supports Object.defineProperty
            this._defineGetterSetter_defineProperty();
        }

        //insert self into the HashMap
        this._entry = Crafty.map.insert(this);

        //when object changes, update HashMap
        this.bind("Move", function (e) {
            // Choose the largest bounding region that exists
            var area = this._cbr || this._mbr || this;
            this._entry.update(area);
            // Move children (if any) by the same amount
            if (this._children.length > 0) {
                this._cascade(e);
            }
        });

        this.bind("Rotate", function (e) {
            // Choose the largest bounding region that exists
            var old = this._cbr || this._mbr || this;
            this._entry.update(old);
            // Rotate children (if any) by the same amount
            if (this._children.length > 0) {
                this._cascade(e);
            }
        });

        //when object is removed, remove from HashMap and destroy attached children
        this.bind("Remove", function () {
            if (this._children) {
                for (var i = 0; i < this._children.length; i++) {
                    // delete the child's _parent link, or else the child will splice itself out of
                    // this._children while destroying itself (which messes up this for-loop iteration).
                    delete this._children[i]._parent;

                    // Destroy child if possible (It's not always possible, e.g. the polygon attached
                    // by areaMap has no .destroy(), it will just get garbage-collected.)
                    if (this._children[i].destroy) {
                        this._children[i].destroy();
                    }
                }
                this._children = [];
            }

            if (this._parent) {
                this._parent.detach(this);
            }

            Crafty.map.remove(this);

            this.detach();
        });
    },


    /**@
     * #.offsetBoundary
     * @comp 2D
     * Extends the MBR of the entity by a specified amount.
     * 
     * @trigger BoundaryOffset - when the MBR offset changes
     * @sign public this .offsetBoundary(Number dx1, Number dy1, Number dx2, Number dy2)
     * @param dx1 - Extends the MBR to the left by this amount
     * @param dy1 - Extends the MBR upward by this amount
     * @param dx2 - Extends the MBR to the right by this amount
     * @param dy2 - Extends the MBR downward by this amount
     *
     * @sign public this .offsetBoundary(Number offset)
     * @param offset - Extend the MBR in all directions by this amount
     *
     * You would most likely use this function to ensure that custom canvas rendering beyond the extent of the entity's normal bounds is not clipped.
     */
    offsetBoundary: function(x1, y1, x2, y2){
        if (arguments.length === 1)
            y1 = x2 = y2 = x1;
        this._bx1 = x1;
        this._bx2 = x2;
        this._by1 = y1;
        this._by2 = y2;
        this.trigger("BoundaryOffset");
        this._calculateMBR();
        return this;
    },

    /**
     * Calculates the MBR when rotated some number of radians about an origin point o.
     * Necessary on a rotation, or a resize
     */

    _calculateMBR: function () {
        var ox = this._origin.x + this._x,
            oy = this._origin.y + this._y,
            rad = -this._rotation * DEG_TO_RAD;
        // axis-aligned (unrotated) coordinates, relative to the origin point
        var dx1 = this._x - this._bx1 - ox,
            dx2 = this._x + this._w + this._bx2 - ox,
            dy1 = this._y - this._by1 - oy,
            dy2 = this._y + this._h + this._by2 - oy;

        var ct = Math.cos(rad),
            st = Math.sin(rad);
        // Special case 90 degree rotations to prevent rounding problems
        ct = (ct < 1e-10 && ct > -1e-10) ? 0 : ct;
        st = (st < 1e-10 && st > -1e-10) ? 0 : st;

        // Calculate the new points relative to the origin, then find the new (absolute) bounding coordinates!
        var x0 =   dx1 * ct + dy1 * st,
            y0 = - dx1 * st + dy1 * ct,
            x1 =   dx2 * ct + dy1 * st,
            y1 = - dx2 * st + dy1 * ct,
            x2 =   dx2 * ct + dy2 * st,
            y2 = - dx2 * st + dy2 * ct,
            x3 =   dx1 * ct + dy2 * st,
            y3 = - dx1 * st + dy2 * ct,
            minx = Math.floor(Math.min(x0, x1, x2, x3) + ox),
            miny = Math.floor(Math.min(y0, y1, y2, y3) + oy),
            maxx = Math.ceil(Math.max(x0, x1, x2, x3) + ox),
            maxy = Math.ceil(Math.max(y0, y1, y2, y3) + oy);
        if (!this._mbr) {
            this._mbr = {
                _x: minx,
                _y: miny,
                _w: maxx - minx,
                _h: maxy - miny
            };
        } else {
            this._mbr._x = minx;
            this._mbr._y = miny;
            this._mbr._w = maxx - minx;
            this._mbr._h = maxy - miny;
        }

        // If a collision hitbox exists AND sits outside the entity, find a bounding box for both.
        // `_cbr` contains information about a bounding circle of the hitbox. 
        // The bounds of `_cbr` will be the union of the `_mbr` and the bounding box of that circle.
        // This will not be a minimal region, but since it's only used for the broad phase pass it's good enough. 
        //
        // cbr is calculated by the `_checkBounds` method of the "Collision" component
        if (this._cbr) {
            var cbr = this._cbr;
            var cx = cbr.cx, cy = cbr.cy, r = cbr.r;
            var cx2 = ox + (cx + this._x - ox) * ct + (cy + this._y - oy) * st;
            var cy2 = oy - (cx + this._x - ox) * st + (cy + this._y - oy) * ct;
            cbr._x = Math.min(cx2 - r, minx);
            cbr._y = Math.min(cy2 - r, miny);
            cbr._w = Math.max(cx2 + r, maxx) - cbr._x;
            cbr._h = Math.max(cy2 + r, maxy) - cbr._y;
        }

    },

    /**
     * Handle changes that need to happen on a rotation
     */
    _rotate: function (v) {
        var theta = -1 * (v % 360); //angle always between 0 and 359
        var difference = this._rotation - v;
        // skip if there's no rotation!
        if (difference === 0)
            return;
        else
            this._rotation = v;

        //Calculate the new MBR
        var rad = theta * DEG_TO_RAD,
            o = {
                x: this._origin.x + this._x,
                y: this._origin.y + this._y
            };

        this._calculateMBR();


        //trigger "Rotate" event
        var drad = difference * DEG_TO_RAD,
            ct = Math.cos(rad),
            st = Math.sin(rad);

        this.trigger("Rotate", {
            cos: Math.cos(drad),
            sin: Math.sin(drad),
            deg: difference,
            rad: drad,
            o: o
        });
    },

    /**@
     * #.area
     * @comp 2D
     * @sign public Number .area(void)
     * Calculates the area of the entity
     */
    area: function () {
        return this._w * this._h;
    },

    /**@
     * #.intersect
     * @comp 2D
     * @sign public Boolean .intersect(Number x, Number y, Number w, Number h)
     * @param x - X position of the rect
     * @param y - Y position of the rect
     * @param w - Width of the rect
     * @param h - Height of the rect
     * @sign public Boolean .intersect(Object rect)
     * @param rect - An object that must have the `x, y, w, h` values as properties
     * Determines if this entity intersects a rectangle.  If the entity is rotated, its MBR is used for the test.
     */
    intersect: function (x, y, w, h) {
        var rect, mbr = this._mbr || this;
        if (typeof x === "object") {
            rect = x;
        } else {
            rect = {
                x: x,
                y: y,
                w: w,
                h: h
            };
        }

        return mbr._x < rect.x + rect.w && mbr._x + mbr._w > rect.x &&
            mbr._y < rect.y + rect.h && mbr._h + mbr._y > rect.y;
    },

    /**@
     * #.within
     * @comp 2D
     * @sign public Boolean .within(Number x, Number y, Number w, Number h)
     * @param x - X position of the rect
     * @param y - Y position of the rect
     * @param w - Width of the rect
     * @param h - Height of the rect
     * @sign public Boolean .within(Object rect)
     * @param rect - An object that must have the `_x, _y, _w, _h` values as properties
     * Determines if this current entity is within another rectangle.
     */
    within: function (x, y, w, h) {
        var rect, mbr = this._mbr || this;
        if (typeof x === "object") {
            rect = x;
        } else {
            rect = {
                _x: x,
                _y: y,
                _w: w,
                _h: h
            };
        }

        return rect._x <= mbr._x && rect._x + rect._w >= mbr._x + mbr._w &&
            rect._y <= mbr._y && rect._y + rect._h >= mbr._y + mbr._h;
    },

    /**@
     * #.contains
     * @comp 2D
     * @sign public Boolean .contains(Number x, Number y, Number w, Number h)
     * @param x - X position of the rect
     * @param y - Y position of the rect
     * @param w - Width of the rect
     * @param h - Height of the rect
     * @sign public Boolean .contains(Object rect)
     * @param rect - An object that must have the `_x, _y, _w, _h` values as properties.
     * Determines if the rectangle is within the current entity.  If the entity is rotated, its MBR is used for the test.
     */
    contains: function (x, y, w, h) {
        var rect, mbr = this._mbr || this;
        if (typeof x === "object") {
            rect = x;
        } else {
            rect = {
                _x: x,
                _y: y,
                _w: w,
                _h: h
            };
        }

        return rect._x >= mbr._x && rect._x + rect._w <= mbr._x + mbr._w &&
            rect._y >= mbr._y && rect._y + rect._h <= mbr._y + mbr._h;
    },

    /**@
     * #.pos
     * @comp 2D
     * @sign public Object .pos(void)
     * Returns the x, y, w, h properties as a rect object
     * (a rect object is just an object with the keys _x, _y, _w, _h).
     *
     * The keys have an underscore prefix. This is due to the x, y, w, h
     * properties being merely setters and getters that wrap the properties with an underscore (_x, _y, _w, _h).
     */
    pos: function () {
        return {
            _x: (this._x),
            _y: (this._y),
            _w: (this._w),
            _h: (this._h)
        };
    },

    /**@
     * #.mbr
     * @comp 2D
     * @sign public Object .mbr()
     * Returns the minimum bounding rectangle. If there is no rotation
     * on the entity it will return the rect.
     */
    mbr: function () {
        if (!this._mbr) return this.pos();
        return {
            _x: (this._mbr._x),
            _y: (this._mbr._y),
            _w: (this._mbr._w),
            _h: (this._mbr._h)
        };
    },

    /**@
     * #.isAt
     * @comp 2D
     * @sign public Boolean .isAt(Number x, Number y)
     * @param x - X position of the point
     * @param y - Y position of the point
     * Determines whether a point is contained by the entity. Unlike other methods,
     * an object can't be passed. The arguments require the x and y value.
     *
     * The given point is tested against the first of the following that exists: a mapArea associated with "Mouse", the hitarea associated with "Collision", or the object's MBR.
     */
    isAt: function (x, y) {
        if (this.mapArea) {
            return this.mapArea.containsPoint(x, y);
        } else if (this.map) {
            return this.map.containsPoint(x, y);
        }
        var mbr = this._mbr || this;
        return mbr._x <= x && mbr._x + mbr._w >= x &&
            mbr._y <= y && mbr._y + mbr._h >= y;
    },

    /**@
     * #.move
     * @comp 2D
     * @sign public this .move(String dir, Number by)
     * @param dir - Direction to move (n,s,e,w,ne,nw,se,sw)
     * @param by - Amount to move in the specified direction
     * Quick method to move the entity in a direction (n, s, e, w, ne, nw, se, sw) by an amount of pixels.
     */
    move: function (dir, by) {
        if (dir.charAt(0) === 'n') this.y -= by;
        if (dir.charAt(0) === 's') this.y += by;
        if (dir === 'e' || dir.charAt(1) === 'e') this.x += by;
        if (dir === 'w' || dir.charAt(1) === 'w') this.x -= by;

        return this;
    },

    /**@
     * #.shift
     * @comp 2D
     * @sign public this .shift(Number x, Number y, Number w, Number h)
     * @param x - Amount to move X
     * @param y - Amount to move Y
     * @param w - Amount to widen
     * @param h - Amount to increase height
     * Shift or move the entity by an amount. Use negative values
     * for an opposite direction.
     */
    shift: function (x, y, w, h) {
        if (x) this.x += x;
        if (y) this.y += y;
        if (w) this.w += w;
        if (h) this.h += h;

        return this;
    },

    /**@
     * #._cascade
     * @comp 2D
     * @sign public void ._cascade(e)
     * @param e - An object describing the motion
     * Move or rotate the entity's children according to a certain motion.
     * This method is part of a function bound to "Move": It is used
     * internally for ensuring that when a parent moves, the child also
     * moves in the same way.
     */
    _cascade: function (e) {
        if (!e) return; //no change in position
        var i = 0,
            children = this._children,
            l = children.length,
            obj;
        //rotation
        if (e.cos) {
            for (; i < l; ++i) {
                obj = children[i];
                if ('rotate' in obj) obj.rotate(e);
            }
        } else {
            //use current position
            var dx = this._x - e._x,
                dy = this._y - e._y,
                dw = this._w - e._w,
                dh = this._h - e._h;

            for (; i < l; ++i) {
                obj = children[i];
                obj.shift(dx, dy, dw, dh);
            }
        }
    },

    /**@
     * #.attach
     * @comp 2D
     * @sign public this .attach(Entity obj[, .., Entity objN])
     * @param obj - Child entity(s) to attach
     * Sets one or more entities to be children, with the current entity (`this`)
     * as the parent. When the parent moves or rotates, its children move or
     * rotate by the same amount. (But not vice-versa: If you move a child, it
     * will not move the parent.) When the parent is destroyed, its children are
     * destroyed.
     *
     * For any entity, `this._children` is the array of its children entity
     * objects (if any), and `this._parent` is its parent entity object (if any).
     *
     * As many objects as wanted can be attached, and a hierarchy of objects is
     * possible by attaching.
     */
    attach: function () {
        var i = 0,
            arg = arguments,
            l = arguments.length,
            obj;
        for (; i < l; ++i) {
            obj = arg[i];
            if (obj._parent) {
                obj._parent.detach(obj);
            }
            obj._parent = this;
            this._children.push(obj);
        }

        return this;
    },

    /**@
     * #.detach
     * @comp 2D
     * @sign public this .detach([Entity obj])
     * @param obj - The entity to detach. Left blank will remove all attached entities
     * Stop an entity from following the current entity. Passing no arguments will stop
     * every entity attached.
     */
    detach: function (obj) {
        var i;
        //if nothing passed, remove all attached objects
        if (!obj) {
            for (i = 0; i < this._children.length; i++) {
                this._children[i]._parent = null;
            }
            this._children = [];
            return this;
        }

        //if obj passed, find the handler and unbind
        for (i = 0; i < this._children.length; i++) {
            if (this._children[i] == obj) {
                this._children.splice(i, 1);
            }
        }
        obj._parent = null;

        return this;
    },

    /**@
     * #.origin
     * @comp 2D
     * @sign public this .origin(Number x, Number y)
     * @param x - Pixel value of origin offset on the X axis
     * @param y - Pixel value of origin offset on the Y axis
     * @sign public this .origin(String offset)
     * @param offset - Combination of center, top, bottom, middle, left and right
     * Set the origin point of an entity for it to rotate around.
     *
     * @example
     * ~~~
     * this.origin("top left")
     * this.origin("center")
     * this.origin("bottom right")
     * this.origin("middle right")
     * ~~~
     *
     * @see .rotation
     */
    origin: function (x, y) {
        //text based origin
        if (typeof x === "string") {
            if (x === "centre" || x === "center" || x.indexOf(' ') === -1) {
                x = this._w / 2;
                y = this._h / 2;
            } else {
                var cmd = x.split(' ');
                if (cmd[0] === "top") y = 0;
                else if (cmd[0] === "bottom") y = this._h;
                else if (cmd[0] === "middle" || cmd[1] === "center" || cmd[1] === "centre") y = this._h / 2;

                if (cmd[1] === "center" || cmd[1] === "centre" || cmd[1] === "middle") x = this._w / 2;
                else if (cmd[1] === "left") x = 0;
                else if (cmd[1] === "right") x = this._w;
            }
        }

        this._origin.x = x;
        this._origin.y = y;

        return this;
    },

    /**@
     * #.flip
     * @comp 2D
     * @trigger Invalidate - when the entity has flipped
     * @sign public this .flip(String dir)
     * @param dir - Flip direction
     *
     * Flip entity on passed direction
     *
     * @example
     * ~~~
     * this.flip("X")
     * ~~~
     */
    flip: function (dir) {
        dir = dir || "X";
        if (!this["_flip" + dir]) {
            this["_flip" + dir] = true;
            this.trigger("Invalidate");
        }
        return this;
    },

    /**@
     * #.unflip
     * @comp 2D
     * @trigger Invalidate - when the entity has unflipped
     * @sign public this .unflip(String dir)
     * @param dir - Unflip direction
     *
     * Unflip entity on passed direction (if it's flipped)
     *
     * @example
     * ~~~
     * this.unflip("X")
     * ~~~
     */
    unflip: function (dir) {
        dir = dir || "X";
        if (this["_flip" + dir]) {
            this["_flip" + dir] = false;
            this.trigger("Invalidate");
        }
        return this;
    },

    /**
     * Method for rotation rather than through a setter
     */
    rotate: function (e) {
        var x2, y2;
        x2 =  (this._x + this._origin.x - e.o.x) * e.cos + (this._y + this._origin.y - e.o.y) * e.sin + (e.o.x - this._origin.x);
        y2 =  (this._y + this._origin.y - e.o.y) * e.cos - (this._x + this._origin.x - e.o.x) * e.sin + (e.o.y - this._origin.y);
        this._attr('_rotation', this._rotation - e.deg);
        this._attr('_x', x2 );
        this._attr('_y', y2 );
    },

    /**@
     * #._attr
     * @comp 2D
     * Setter method for all 2D properties including
     * x, y, w, h, alpha, rotation and visible.
     */
    _attr: function (name, value) {
        // Return if there is no change
        if (this[name] === value) {
            return;
        }
        //keep a reference of the old positions
        var old = Crafty._rectPool.copy(this);

        var mbr;
        //if rotation, use the rotate method
        if (name === '_rotation') {
            this._rotate(value); // _rotate triggers "Rotate"
            //set the global Z and trigger reorder just in case
        } else if (name === '_z') {
            this._globalZ = parseInt(value + Crafty.zeroFill(this[0], 5), 10); //magic number 10^5 is the max num of entities
            this.trigger("reorder");
            //if the rect bounds change, update the MBR and trigger move
        } else if (name === '_x' || name === '_y') {
            // mbr is the minimal bounding rectangle of the entity
            mbr = this._mbr;
            if (mbr) {
                mbr[name] -= this[name] - value;
                // cbr is a non-minmal bounding rectangle that contains both hitbox and mbr
                // It will exist only when the collision hitbox sits outside the entity
                if (this._cbr){
                    this._cbr[name] -= this[name] - value;
                }
            }
            this[name] = value;

            this.trigger("Move", old);

        } else if (name === '_h' || name === '_w') {
            mbr = this._mbr;

            var oldValue = this[name];
            this[name] = value;
            if (mbr) {
                this._calculateMBR();
            }
            if (name === '_w') {
                this.trigger("Resize", {
                    axis: 'w',
                    amount: value - oldValue
                });
            } else if (name === '_h') {
                this.trigger("Resize", {
                    axis: 'h',
                    amount: value - oldValue
                });
            }
            this.trigger("Move", old);

        }

        //everything will assume the value
        this[name] = value;

        // flag for redraw
        this.trigger("Invalidate");

        Crafty._rectPool.recycle(old);
    }
});

/**@
 * #Gravity
 * @category 2D
 * @trigger Moved - When entity has moved on y-axis a Moved event is triggered with an object specifying the old position {x: old_x, y: old_y}
 * 
 * Adds gravitational pull to the entity.
 */
Crafty.c("Gravity", {
    _gravityConst: 0.2,
    _gy: 0,
    _falling: true,
    _anti: null,

    init: function () {
        this.requires("2D");
    },

    /**@
     * #.gravity
     * @comp Gravity
     * @sign public this .gravity([comp])
     * @param comp - The name of a component that will stop this entity from falling
     *
     * Enable gravity for this entity no matter whether comp parameter is not specified,
     * If comp parameter is specified all entities with that component will stop this entity from falling.
     * For a player entity in a platform game this would be a component that is added to all entities
     * that the player should be able to walk on.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Color, Gravity")
     *   .color("red")
     *   .attr({ w: 100, h: 100 })
     *   .gravity("platform");
     * ~~~
     */
    gravity: function (comp) {
        if (comp) this._anti = comp;
        if(isNaN(this._jumpSpeed)) this._jumpSpeed = 0; //set to 0 if Twoway component is not present

        this.bind("EnterFrame", this._enterFrame);

        return this;
    },

    /**@
     * #.gravityConst
     * @comp Gravity
     * @sign public this .gravityConst(g)
     * @param g - gravitational constant
     *
     * Set the gravitational constant to g. The default is .2. The greater g, the faster the object falls.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Color, Gravity")
     *   .color("red")
     *   .attr({ w: 100, h: 100 })
     *   .gravity("platform")
     *   .gravityConst(2)
     * ~~~
     */
    gravityConst: function (g) {
        this._gravityConst = g;
        return this;
    },

    _enterFrame: function () {
        if (this._falling) {
            //if falling, move the players Y
            this._gy += this._gravityConst;
            this.y += this._gy;
            this.trigger('Moved', { x: this._x, y: this._y - this._gy });
        } else {
            this._gy = 0; //reset change in y
        }

        var obj, hit = false,
            pos = this.pos(),
            q, i = 0,
            l;

        //Increase by 1 to make sure map.search() finds the floor
        pos._y++;

        //map.search wants _x and intersect wants x...
        pos.x = pos._x;
        pos.y = pos._y;
        pos.w = pos._w;
        pos.h = pos._h;

        q = Crafty.map.search(pos);
        l = q.length;

        for (; i < l; ++i) {
            obj = q[i];
            //check for an intersection directly below the player
            if (obj !== this && obj.has(this._anti) && obj.intersect(pos)) {
                hit = obj;
                break;
            }
        }

        if (hit) { //stop falling if found and player is moving down
            if (this._falling && ((this._gy > this._jumpSpeed) || !this._up)){
              this.stopFalling(hit);
            }
        } else {
            this._falling = true; //keep falling otherwise
        }
    },

    stopFalling: function (e) {
        if (e) this.y = e._y - this._h; //move object

        //this._gy = -1 * this._bounce;
        this._falling = false;
        if (this._up) this._up = false;
        this.trigger("hit");
    },

    /**@
     * #.antigravity
     * @comp Gravity
     * @sign public this .antigravity()
     * Disable gravity for this component. It can be reenabled by calling .gravity()
     */
    antigravity: function () {
        this.unbind("EnterFrame", this._enterFrame);
    }
});

/**@
 * #Crafty.polygon
 * @category 2D
 *
 * Polygon object used for hitboxes and click maps. Must pass an Array for each point as an
 * argument where index 0 is the x position and index 1 is the y position.
 *
 * For example one point of a polygon will look like this: `[0,5]` where the `x` is `0` and the `y` is `5`.
 *
 * Can pass an array of the points or simply put each point as an argument.
 *
 * When creating a polygon for an entity, each point should be offset or relative from the entities `x` and `y`
 * (don't include the absolute values as it will automatically calculate this).
 *
 *
 * @example
 * ~~~
 * new Crafty.polygon([50,0],[100,100],[0,100]);
 * new Crafty.polygon([[50,0],[100,100],[0,100]]);
 * ~~~
 */
Crafty.polygon = function (poly) {
    if (arguments.length > 1) {
        poly = Array.prototype.slice.call(arguments, 0);
    }
    this.points = poly;
};

Crafty.polygon.prototype = {
    /**@
     * #.containsPoint
     * @comp Crafty.polygon
     * @sign public Boolean .containsPoint(Number x, Number y)
     * @param x - X position of the point
     * @param y - Y position of the point
     *
     * Method is used to determine if a given point is contained by the polygon.
     *
     * @example
     * ~~~
     * var poly = new Crafty.polygon([50,0],[100,100],[0,100]);
     * poly.containsPoint(50, 50); //TRUE
     * poly.containsPoint(0, 0); //FALSE
     * ~~~
     */
    containsPoint: function (x, y) {
        var p = this.points,
            i, j, c = false;

        for (i = 0, j = p.length - 1; i < p.length; j = i++) {
            if (((p[i][1] > y) != (p[j][1] > y)) && (x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) {
                c = !c;
            }
        }

        return c;
    },

    /**@
     * #.shift
     * @comp Crafty.polygon
     * @sign public void .shift(Number x, Number y)
     * @param x - Amount to shift the `x` axis
     * @param y - Amount to shift the `y` axis
     *
     * Shifts every single point in the polygon by the specified amount.
     *
     * @example
     * ~~~
     * var poly = new Crafty.polygon([50,0],[100,100],[0,100]);
     * poly.shift(5,5);
     * //[[55,5], [105,5], [5,105]];
     * ~~~
     */
    shift: function (x, y) {
        var i = 0,
            l = this.points.length,
            current;
        for (; i < l; i++) {
            current = this.points[i];
            current[0] += x;
            current[1] += y;
        }
    },

    rotate: function (e) {
        var i = 0,
            l = this.points.length,
            current, x, y;

        for (; i < l; i++) {
            current = this.points[i];

            x = e.o.x + (current[0] - e.o.x) * e.cos + (current[1] - e.o.y) * e.sin;
            y = e.o.y - (current[0] - e.o.x) * e.sin + (current[1] - e.o.y) * e.cos;

            current[0] = x;
            current[1] = y;
        }
    }
};

/**@
 * #Crafty.circle
 * @category 2D
 * Circle object used for hitboxes and click maps. Must pass a `x`, a `y` and a `radius` value.
 *
 *@example
 * ~~~
 * var centerX = 5,
 *     centerY = 10,
 *     radius = 25;
 *
 * new Crafty.circle(centerX, centerY, radius);
 * ~~~
 *
 * When creating a circle for an entity, each point should be offset or relative from the entities `x` and `y`
 * (don't include the absolute values as it will automatically calculate this).
 */
Crafty.circle = function (x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;

    // Creates an octagon that approximate the circle for backward compatibility.
    this.points = [];
    var theta;

    for (var i = 0; i < 8; i++) {
        theta = i * Math.PI / 4;
        this.points[i] = [this.x + (Math.sin(theta) * radius), this.y + (Math.cos(theta) * radius)];
    }
};

Crafty.circle.prototype = {
    /**@
     * #.containsPoint
     * @comp Crafty.circle
     * @sign public Boolean .containsPoint(Number x, Number y)
     * @param x - X position of the point
     * @param y - Y position of the point
     *
     * Method is used to determine if a given point is contained by the circle.
     *
     * @example
     * ~~~
     * var circle = new Crafty.circle(0, 0, 10);
     * circle.containsPoint(0, 0); //TRUE
     * circle.containsPoint(50, 50); //FALSE
     * ~~~
     */
    containsPoint: function (x, y) {
        var radius = this.radius,
            sqrt = Math.sqrt,
            deltaX = this.x - x,
            deltaY = this.y - y;

        return (deltaX * deltaX + deltaY * deltaY) < (radius * radius);
    },

    /**@
     * #.shift
     * @comp Crafty.circle
     * @sign public void .shift(Number x, Number y)
     * @param x - Amount to shift the `x` axis
     * @param y - Amount to shift the `y` axis
     *
     * Shifts the circle by the specified amount.
     *
     * @example
     * ~~~
     * var circle = new Crafty.circle(0, 0, 10);
     * circle.shift(5,5);
     * //{x: 5, y: 5, radius: 10};
     * ~~~
     */
    shift: function (x, y) {
        this.x += x;
        this.y += y;

        var i = 0,
            l = this.points.length,
            current;
        for (; i < l; i++) {
            current = this.points[i];
            current[0] += x;
            current[1] += y;
        }
    },

    rotate: function () {
        // We are a circle, we don't have to rotate :)
    }
};


Crafty.matrix = function (m) {
    this.mtx = m;
    this.width = m[0].length;
    this.height = m.length;
};

Crafty.matrix.prototype = {
    x: function (other) {
        if (this.width != other.height) {
            return;
        }

        var result = [];
        for (var i = 0; i < this.height; i++) {
            result[i] = [];
            for (var j = 0; j < other.width; j++) {
                var sum = 0;
                for (var k = 0; k < this.width; k++) {
                    sum += this.mtx[i][k] * other.mtx[k][j];
                }
                result[i][j] = sum;
            }
        }
        return new Crafty.matrix(result);
    },


    e: function (row, col) {
        //test if out of bounds
        if (row < 1 || row > this.mtx.length || col < 1 || col > this.mtx[0].length) return null;
        return this.mtx[row - 1][col - 1];
    }
};

},{"./HashMap.js":2,"./core.js":7}],2:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**
 * Spatial HashMap for broad phase collision
 *
 * @author Louis Stowasser
 */

    /**@
     * #Crafty.HashMap.constructor
     * @comp Crafty.HashMap
     * @sign public void Crafty.HashMap([cellsize])
     * @param cellsize - the cell size. If omitted, `cellsize` is 64.
     *
     * Set `cellsize`.
     * And create `this.map`.
     */
    var cellsize,

        HashMap = function (cell) {
            cellsize = cell || 64;
            this.map = {};
        },

        SPACE = " ",
        keyHolder = {};

    HashMap.prototype = {
        /**@
         * #Crafty.map.insert
         * @comp Crafty.map
         * @sign public Object Crafty.map.insert(Object obj)
         * @param obj - An entity to be inserted.
         *
         * `obj` is inserted in '.map' of the corresponding broad phase cells. An object of the following fields is returned.
         * ~~~
         * - the object that keep track of cells (keys)
         * - `obj`
         * - the HashMap object
         * ~~~
         */
        insert: function (obj) {
            var keys = HashMap.key(obj),
                entry = new Entry(keys, obj, this),
                i = 0,
                j,
                hash;

            //insert into all x buckets
            for (i = keys.x1; i <= keys.x2; i++) {
                //insert into all y buckets
                for (j = keys.y1; j <= keys.y2; j++) {
                    hash = (i << 16) ^ j;
                    if (!this.map[hash]) this.map[hash] = [];
                    this.map[hash].push(obj);
                }
            }

            return entry;
        },

        /**@
         * #Crafty.map.search
         * @comp Crafty.map
         * @sign public Object Crafty.map.search(Object rect[, Boolean filter])
         * @param rect - the rectangular region to search for entities.
         * @param filter - Default value is true. Otherwise, must be false.
         *
         * - If `filter` is `false`, just search for all the entries in the give `rect` region by broad phase collision. Entity may be returned duplicated.
         * - If `filter` is `true`, filter the above results by checking that they actually overlap `rect`.
         * The easier usage is with `filter`=`true`. For performance reason, you may use `filter`=`false`, and filter the result yourself. See examples in drawing.js and collision.js
         */

        search: function (rect, filter) {
            var keys = HashMap.key(rect, keyHolder),
                i, j, k,
                results = [];

            if (filter === undefined) filter = true; //default filter to true

            //search in all x buckets
            for (i = keys.x1; i <= keys.x2; i++) {
                //insert into all y buckets
                for (j = keys.y1; j <= keys.y2; j++) {
                    cell = this.map[(i << 16) ^ j];
                    if (cell) {
                        for (k = 0; k < cell.length; k++)
                            results.push(cell[k]);
                    }
                }
            }

            if (filter) {
                var obj, id, finalresult = [],
                    found = {};
                //add unique elements to lookup table with the entity ID as unique key
                for (i = 0, l = results.length; i < l; i++) {
                    obj = results[i];
                    if (!obj) continue; //skip if deleted
                    id = obj[0]; //unique ID
                    obj = obj._mbr || obj;
                    //check if not added to hash and that actually intersects
                    if (!found[id] && obj._x < rect._x + rect._w && obj._x + obj._w > rect._x &&
                        obj._y < rect._y + rect._h && obj._h + obj._y > rect._y)
                        found[id] = results[i];
                }

                //loop over lookup table and copy to final array
                for (obj in found) finalresult.push(found[obj]);

                return finalresult;
            } else {
                return results;
            }
        },

        /**@
         * #Crafty.map.remove
         * @comp Crafty.map
         * @sign public void Crafty.map.remove([Object keys, ]Object obj)
         * @param keys - key region. If omitted, it will be derived from obj by `Crafty.HashMap.key`.
         * @param obj - need more document.
         *
         * Remove an entity in a broad phase map.
         * - The second form is only used in Crafty.HashMap to save time for computing keys again, where keys were computed previously from obj. End users should not call this form directly.
         *
         * @example
         * ~~~
         * Crafty.map.remove(e);
         * ~~~
         */
        remove: function (keys, obj) {
            var i = 0,
                j, hash;

            if (arguments.length == 1) {
                obj = keys;
                keys = HashMap.key(obj, keyHolder);
            }

            //search in all x buckets
            for (i = keys.x1; i <= keys.x2; i++) {
                //insert into all y buckets
                for (j = keys.y1; j <= keys.y2; j++) {
                    hash = (i << 16) ^ j;

                    if (this.map[hash]) {
                        var cell = this.map[hash],
                            m, n = cell.length;
                        //loop over objs in cell and delete
                        for (m = 0; m < n; m++)
                            if (cell[m] && cell[m][0] === obj[0])
                                cell.splice(m, 1);
                    }
                }
            }
        },

        /**@
         * #Crafty.map.refresh
         * @comp Crafty.map
         * @sign public void Crafty.map.remove(Entry entry)
         * @param entry - An entry to update
         *
         * Refresh an entry's keys, and its position in the broad phrase map.
         *
         * @example
         * ~~~
         * Crafty.map.refresh(e);
         * ~~~
         */
        refresh: function (entry) {
            var keys = entry.keys;
            var obj = entry.obj;
            var cell, i, j, m, n;

            //First delete current object from appropriate cells
            for (i = keys.x1; i <= keys.x2; i++) {
                for (j = keys.y1; j <= keys.y2; j++) {
                    cell = this.map[(i << 16) ^ j];
                    if (cell) {
                        n = cell.length;
                        //loop over objs in cell and delete
                        for (m = 0; m < n; m++)
                            if (cell[m] && cell[m][0] === obj[0])
                                cell.splice(m, 1);
                    }
                }
            }

            //update keys
            HashMap.key(obj, keys);

            //insert into all rows and columns
            for (i = keys.x1; i <= keys.x2; i++) {
                for (j = keys.y1; j <= keys.y2; j++) {
                    cell = this.map[(i << 16) ^ j];
                    if (!cell) cell = this.map[(i << 16) ^ j] = [];
                    cell.push(obj);
                }
            }

            return entry;
        },




        /**@
         * #Crafty.map.boundaries
         * @comp Crafty.map
         * @sign public Object Crafty.map.boundaries()
         *
         * The return `Object` is of the following format.
         * ~~~
         * {
         *   min: {
         *     x: val_x,
         *     y: val_y
         *   },
         *   max: {
         *     x: val_x,
         *     y: val_y
         *   }
         * }
         * ~~~
         */
        boundaries: function () {
            var k, ent,
                hash = {
                    max: {
                        x: -Infinity,
                        y: -Infinity
                    },
                    min: {
                        x: Infinity,
                        y: Infinity
                    }
                },
                coords = {
                    max: {
                        x: -Infinity,
                        y: -Infinity
                    },
                    min: {
                        x: Infinity,
                        y: Infinity
                    }
                };

            //Using broad phase hash to speed up the computation of boundaries.
            for (var h in this.map) {
                if (!this.map[h].length) continue;

                //broad phase coordinate
                var i = h >> 16,
                    j = (h << 16) >> 16;
                if (j < 0) {
                    i = i ^ -1;
                }
                if (i >= hash.max.x) {
                    hash.max.x = i;
                    for (k in this.map[h]) {
                        ent = this.map[h][k];
                        //make sure that this is a Crafty entity
                        if (typeof ent == 'object' && 'requires' in ent) {
                            coords.max.x = Math.max(coords.max.x, ent.x + ent.w);
                        }
                    }
                }
                if (i <= hash.min.x) {
                    hash.min.x = i;
                    for (k in this.map[h]) {
                        ent = this.map[h][k];
                        if (typeof ent == 'object' && 'requires' in ent) {
                            coords.min.x = Math.min(coords.min.x, ent.x);
                        }
                    }
                }
                if (j >= hash.max.y) {
                    hash.max.y = j;
                    for (k in this.map[h]) {
                        ent = this.map[h][k];
                        if (typeof ent == 'object' && 'requires' in ent) {
                            coords.max.y = Math.max(coords.max.y, ent.y + ent.h);
                        }
                    }
                }
                if (j <= hash.min.y) {
                    hash.min.y = j;
                    for (k in this.map[h]) {
                        ent = this.map[h][k];
                        if (typeof ent == 'object' && 'requires' in ent) {
                            coords.min.y = Math.min(coords.min.y, ent.y);
                        }
                    }
                }
            }

            return coords;
        }
    };

    /**@
     * #Crafty.HashMap
     * @category 2D
     * Broad-phase collision detection engine. See background information at
     *
     * - [N Tutorial B - Broad-Phase Collision](http://www.metanetsoftware.com/technique/tutorialB.html)
     * - [Broad-Phase Collision Detection with CUDA](http.developer.nvidia.com/GPUGems3/gpugems3_ch32.html)
     * @see Crafty.map
     */

    /**@
     * #Crafty.HashMap.key
     * @comp Crafty.HashMap
     * @sign public Object Crafty.HashMap.key(Object obj)
     * @param obj - an Object that has .mbr() or _x, _y, _w and _h.
     * Get the rectangular region (in terms of the grid, with grid size `cellsize`), where the object may fall in. This region is determined by the object's bounding box.
     * The `cellsize` is 64 by default.
     *
     * @see Crafty.HashMap.constructor
     */
    HashMap.key = function (obj, keys) {
        if (obj._mbr) {
            obj = obj._mbr;
        }
        if (!keys) {
            keys = {};
        }

        keys.x1 = Math.floor(obj._x / cellsize);
        keys.y1 = Math.floor(obj._y / cellsize);
        keys.x2 = Math.floor((obj._w + obj._x) / cellsize);
        keys.y2 = Math.floor((obj._h + obj._y) / cellsize);
        return keys;
    };

    HashMap.hash = function (keys) {
        return keys.x1 + SPACE + keys.y1 + SPACE + keys.x2 + SPACE + keys.y2;
    };

    function Entry(keys, obj, map) {
        this.keys = keys;
        this.map = map;
        this.obj = obj;
    }

    Entry.prototype = {
        update: function (rect) {
            //check if buckets change
            if (HashMap.hash(HashMap.key(rect, keyHolder)) != HashMap.hash(this.keys)) {
                this.map.refresh(this);
            }
        }
    };

    module.exports = HashMap;

},{"./core.js":7}],3:[function(require,module,exports){
var Crafty = require('./core.js'),
	document = window.document;

Crafty.easing = function(duration) {
	this.timePerFrame = 1000 / Crafty.timer.FPS();
	this.duration = duration;   //default duration given in ms
	this.reset();
};


Crafty.easing.prototype = {
	duration: 0,
	clock:0,
	steps: null,
	complete: false,
	paused: false,

	// init values
	reset: function(){
		this.loops = 1;
		this.clock = 0;
		this.complete = false;
		this.paused = false;
	},

	repeat: function(loopCount){
		this.loops = loopCount;
	},

	setProgress: function(progress, loopCount){
		this.clock = this.duration * progress;
		if (typeof loopCount !== "undefined")
			this.loops = loopCount;

	},

	pause: function(){
		this.paused = true;
	},

	resume: function(){
		this.paused = false;
		this.complete = false;
	},

	// Increment the clock by some amount dt
	// Handles looping and sets a flag on completion
	tick: function(dt){
		if (this.paused || this.complete) return;
		this.clock += dt;
		this.frames = Math.floor(this.clock/this.timePerFrame);
		while (this.clock >= this.duration && this.complete === false){
			this.loops--;
			if (this.loops > 0)
				this.clock -= this.duration;
			else
				this.complete = true;
		}
	},

	// same as value for now; with other time value functions would be more useful
	time: function(){
		return ( Math.min(this.clock/this.duration, 1) );

	},

	// Value is where along the tweening curve we are
	// For now it's simply linear; but we can easily add new types
	value: function(){
		return this.time();
	}

};






/**@
* #SpriteAnimation
* @category Animation
* @trigger StartAnimation - When an animation starts playing, or is resumed from the paused state - {Reel}
* @trigger AnimationEnd - When the animation finishes - { Reel }
* @trigger FrameChange - Each time the frame of the current reel changes - { Reel }
* @trigger ReelChange - When the reel changes - { Reel }
*
* Used to animate sprites by treating a sprite map as a set of animation frames.
* Must be applied to an entity that has a sprite-map component.
*
* To define an animation, see the `reel` method.  To play an animation, see the `animate` method.
*
* A reel is an object that contains the animation frames and current state for an animation.  The reel object has the following properties:
* @param id: (String) - the name of the reel
* @param frames: (Array) - A list of frames in the format [xpos, ypos]
* @param currentFrame: (Number) - The index of the current frame
* @param easing: (Crafty.easing object) - The object that handles the internal progress of the animation.
* @param duration: (Number) - The duration in milliseconds.
*
* Many animation related events pass a reel object as data.  As typical with events, this should be treated as read only data that might be later altered by the entity.  If you wish to preserve the data, make a copy of it.
*
* @see crafty.sprite
*/
Crafty.c("SpriteAnimation", {
	/*
	*
	* A map in which the keys are the names assigned to animations defined using
	* the component (also known as reelIDs), and the values are objects describing
	* the animation and its state.
	*/
	_reels: null,

	/*
	* The reelID of the currently active reel (which is one of the elements in `this._reels`).
	* This value is `null` if no reel is active. Some of the component's actions can be invoked
	* without specifying a reel, in which case they will work on the active reel.
	*/
	_currentReelId: null,

	/*
	* The currently active reel.
	* This value is `null` if no reel is active.
	*/
	_currentReel: null,

	/*
	* Whether or not an animation is currently playing.
	*/
	_isPlaying: false,

	/**@
	* #.animationSpeed
	* @comp SpriteAnimation
	*
	* The playback rate of the animation.  This property defaults to 1.
	*/
	animationSpeed: 1,


	init: function () {
		this._reels = {};
	},

	/**@
	* #.reel
	* @comp SpriteAnimation
	* Used to define reels, to change the active reel, and to fetch the id of the active reel.
	*
	* @sign public this .reel(String reelId, Duration duration, Number fromX, Number fromY, Number frameCount)
	* Defines a reel by starting and ending position on the sprite sheet.
	* @param reelId - ID of the animation reel being created
	* @param duration - The length of the animation in milliseconds.
	* @param fromX - Starting `x` position on the sprite map (x's unit is the horizontal size of the sprite in the sprite map).
	* @param fromY - `y` position on the sprite map (y's unit is the horizontal size of the sprite in the sprite map). Remains constant through the animation.
	* @param frameCount - The number of sequential frames in the animation.  If negative, the animation will play backwards.
	*
	* @sign public this .reel(String reelId, Duration duration, Array frames)
	* Defines a reel by an explicit list of frames
	* @param reelId - ID of the animation reel being created
	* @param duration - The length of the animation in milliseconds.
	* @param frames - An array of arrays containing the `x` and `y` values of successive frames: [[x1,y1],[x2,y2],...] (the values are in the unit of the sprite map's width/height respectively).
	*
	* @sign public this .reel(String reelId)
	* Switches to the specified reel.  The sprite will be updated to that reel's current frame
	* @param reelID - the ID to switch to
	*
	* @sign public Reel .reel()
	* @return The id of the current reel
	*
	*
	* A method to handle animation reels.  Only works for sprites built with the Crafty.sprite methods.
	* See the Tween component for animation of 2D properties.
	*
	* To setup an animation reel, pass the name of the reel (used to identify the reel later), and either an
	* array of absolute sprite positions or the start x on the sprite map, the y on the sprite map and then the end x on the sprite map.
	*
	*
	* @example
	* ~~~
	* // Define a sprite-map component
	* Crafty.sprite(16, "images/sprite.png", {
	*     PlayerSprite: [0,0]
	* });
	*
	* // Define an animation on the second row of the sprite map (fromY = 1)
	* // from the left most sprite (fromX = 0) to the fourth sprite
	* // on that row (frameCount = 4), with a duration of 1 second
	* Crafty.e("2D, DOM, SpriteAnimation, PlayerSprite").reel('PlayerRunning', 1000, 0, 1, 4);
	*
	* // This is the same animation definition, but using the alternative method
	* Crafty.e("2D, DOM, SpriteAnimation, PlayerSprite").reel('PlayerRunning', 1000, [[0, 1], [1, 1], [2, 1], [3, 1]]);
	* ~~~
	*/
	reel: function (reelId, duration, fromX, fromY, frameCount) {
		// @sign public this .reel()
		if (arguments.length === 0)
			return this._currentReelId;

		// @sign public this .reel(String reelID)
		if (arguments.length === 1 && typeof reelId === "string"){
			if (typeof this._reels[reelId] === "undefined")
				throw("The specified reel " + reelId + " is undefined.");
			this.pauseAnimation();
			if (this._currentReelId !== reelId) {
				this._currentReelId = reelId;
				this._currentReel = this._reels[reelId];
				// Change the visible sprite
				this._updateSprite();
				// Trigger event
				this.trigger("ReelChange", this._currentReel);
			}
			return this;
		}


		var reel, i;

		reel = {
			id: reelId,
			frames: [],
			currentFrame: 0,
			easing: new Crafty.easing(duration),
			defaultLoops: 1
		};

		reel.duration = reel.easing.duration;

		// @sign public this .reel(String reelId, Number duration, Number fromX, Number fromY, Number frameDuration)
		if (typeof fromX === "number") {
			i = fromX;
			y = fromY;
			if (frameCount >= 0) {
				for (; i < fromX + frameCount ; i++) {
					reel.frames.push([i, y]);
				}
			}
			else {
				for (; i > fromX + frameCount; i--) {
					reel.frames.push([i, y]);
				}
			}
		}
		// @sign public this .reel(String reelId, Number duration, Array frames)
		else if (arguments.length === 3 && typeof fromX === "object") {
			reel.frames = fromX;
		}
		else {
			throw "Urecognized arguments. Please see the documentation for 'reel(...)'.";
		}

		this._reels[reelId] = reel;

		return this;
	},

	/**@
	* #.animate
	* @comp SpriteAnimation
	* @sign public this .animate([String reelId] [, Number loopCount])
	* @param reelId - ID of the animation reel to play.  Defaults to the current reel if none is specified.
	* @param loopCount - Number of times to repeat the animation. Use -1 to repeat indefinitely.  Defaults to 1.
	*
	* Play one of the reels previously defined through `.reel(...)`. Simply pass the name of the reel. If you wish the
	* animation to play multiple times in succession, pass in the amount of times as an additional parameter.
	* To have the animation repeat indefinitely, pass in `-1`.
	*
	* If another animation is currently playing, it will be paused.
	*
	* This will always play an animation from the beginning.  If you wish to resume from the current state of a reel, use `resumeAnimation()`.
	*
	* Once an animation ends, it will remain at its last frame.
	*
	*
	* @example
	* ~~~
	* // Define a sprite-map component
	* Crafty.sprite(16, "images/sprite.png", {
	*     PlayerSprite: [0,0]
	* });
	*
	* // Play the animation across 20 frames (so each sprite in the 4 sprite animation should be seen for 5 frames) and repeat indefinitely
	* Crafty.e("2D, DOM, SpriteAnimation, PlayerSprite")
	*     .reel('PlayerRunning', 20, 0, 0, 3) // setup animation
	*     .animate('PlayerRunning', -1); // start animation
	* ~~~
	*/
	animate: function(reelId, loopCount) {

		var pos;


		// switch to the specified reel if necessary
		if (typeof reelId === "string")
			this.reel(reelId);

		var currentReel = this._currentReel;

		if (typeof currentReel === "undefined" || currentReel === null)
			throw("No reel is specified, and there is no currently active reel.");

		this.pauseAnimation(); // This will pause the current animation, if one is playing

		// Handle repeats; if loopCount is undefined and reelID is a number, calling with that signature
		if (typeof loopCount === "undefined")
			if (typeof reelId === "number")
				loopCount = reelId;
			else
				loopCount = 1;

		// set the animation to the beginning
		currentReel.easing.reset();


		// user provided loop count.
		this.loops(loopCount);

		// trigger the necessary events and switch to the first frame
		this._setFrame(0);

		// Start the anim
		this.bind("EnterFrame", this._animationTick);
		this._isPlaying = true;

		this.trigger("StartAnimation", currentReel);
		return this;
	},

	/**@
	* #.resumeAnimation
	* @comp SpriteAnimation
	* @sign public this .resumeAnimation()
	*
	* This will resume animation of the current reel from its current state.
	* If a reel is already playing, or there is no current reel, there will be no effect.
	*/
	resumeAnimation: function() {
		if (this._isPlaying === false &&  this._currentReel !== null) {
			this.bind("EnterFrame", this._animationTick);
			this._isPlaying = true;
			this._currentReel.easing.resume();
			this.trigger("StartAnimation", this._currentReel);
		}
		return this;
	},

	/**@
	* #.pauseAnimation
	* @comp SpriteAnimation
	* @sign public this .pauseAnimation(void)
	*
	* Pauses the currently playing animation, or does nothing if no animation is playing.
	*/
	pauseAnimation: function () {
		if (this._isPlaying === true) {
			this.unbind("EnterFrame", this._animationTick);
			this._isPlaying = false;
			this._reels[this._currentReelId].easing.pause();
		}
		return this;
	},

	/**@
	* #.resetAnimation
	* @comp SpriteAnimation
	* @sign public this .resetAnimation()
	*
	* Resets the current animation to its initial state.  Resets the number of loops to the last specified value, which defaults to 1.
	*
	* Neither pauses nor resumes the current animation.
	*/
	resetAnimation: function(){
		var currentReel = this._currentReel;
		if  (currentReel === null)
			throw("No active reel to reset.");
		this.reelPosition(0);
		currentReel.easing.repeat(currentReel.defaultLoops);
		return this;
   },


	/**@
	* #.loops
	* @comp SpriteAnimation
	* @sign public this .loops(Number loopCount)
	* @param loopCount - The number of times to play the animation
	*
	* Sets the number of times the animation will loop for.
	* If called while an animation is in progress, the current state will be considered the first loop.
	*
	* @sign public Number .loops()
	* @returns The number of loops left.  Returns 0 if no reel is active.
	*/
	loops: function(loopCount) {
		if (arguments.length === 0){
			if (this._currentReel !== null)
				return this._currentReel.easing.loops;
			else
				return 0;
		}

		if (this._currentReel !== null){
			if (loopCount < 0)
				loopCount = Infinity;
			this._currentReel.easing.repeat(loopCount);
			this._currentReel.defaultLoops = loopCount;
		}
		return this;

	},

	/**@
	* #.reelPosition
	* @comp SpriteAnimation
	*
	* @sign public this .reelPosition(Integer position)
	* Sets the position of the current reel by frame number.
	* @param position - the frame to jump to.  This is zero-indexed.  A negative values counts back from the last frame.
	*
	* @sign public this .reelPosition(Number position)
	* Sets the position of the current reel by percent progress.
	* @param position - a non-integer number between 0 and 1
	*
	* @sign public this .reelPosition(String position)
	* Jumps to the specified position.  The only currently accepted value is "end", which will jump to the end of the reel.
	*
	* @sign public Number .reelPosition()
	* @returns The current frame number
	*
	*/
	reelPosition: function(position) {
		if (this._currentReel === null)
			throw("No active reel.");

		if (arguments.length === 0)
			return this._currentReel.currentFrame;

		var progress,
			l = this._currentReel.frames.length;
		if (position === "end")
			position = l - 1;

		if (position < 1 && position > 0) {
			progress = position;
			position = Math.floor(l * progress);
		} else {
			if (position !== Math.floor(position))
				throw("Position " + position + " is invalid.");
			if (position < 0)
				position = l - 1 + position;
			progress = position / l;
		}
		// cap to last frame
		position = Math.min(position, l-1);
		position = Math.max(position, 0);
		this._setProgress(progress);
		this._setFrame(position);

		return this;

	},


	// Bound to "EnterFrame".  Progresses the animation by dt, changing the frame if necessary.
	// dt is multiplied by the animationSpeed property
	_animationTick: function(frameData) {
		var currentReel = this._reels[this._currentReelId];
		currentReel.easing.tick(frameData.dt * this.animationSpeed);
		var progress = currentReel.easing.value();
		var frameNumber = Math.min( Math.floor(currentReel.frames.length * progress), currentReel.frames.length - 1);

		this._setFrame(frameNumber);

		if(currentReel.easing.complete === true){
			this.trigger("AnimationEnd", this._currentReel);
			this.pauseAnimation();
		}
	},





	// Set the current frame and update the displayed sprite
	// The actual progress for the animation must be set seperately.
	_setFrame: function(frameNumber) {
		var currentReel = this._currentReel;
		if (frameNumber === currentReel.currentFrame)
			return;
		currentReel.currentFrame = frameNumber;
		this._updateSprite();
		this.trigger("FrameChange", currentReel);
	},

	// Update the displayed sprite.
	_updateSprite: function() {
		var currentReel = this._currentReel;
		var pos = currentReel.frames[currentReel.currentFrame];
		this.sprite(pos[0], pos[1]); // .sprite will trigger redraw

	},


	// Sets the internal state of the current reel's easing object
	_setProgress: function(progress, repeats) {
		this._currentReel.easing.setProgress(progress, repeats);

	},


	/**@
	* #.isPlaying
	* @comp SpriteAnimation
	* @sign public Boolean .isPlaying([String reelId])
	* @param reelId - The reelId of the reel we wish to examine
	* @returns The current animation state
	*
	* Determines if the specified animation is currently playing. If no reelId is specified,
	* checks if any animation is playing.
	*
	* @example
	* ~~~
	* myEntity.isPlaying() // is any animation playing
	* myEntity.isPlaying('PlayerRunning') // is the PlayerRunning animation playing
	* ~~~
	*/
	isPlaying: function (reelId) {
		if (!this._isPlaying) return false;

		if (!reelId) return !!this._currentReelId;
		return this._currentReelId === reelId;
	},

	/**@
	* #.getReel
	* @comp SpriteAnimation
	* @sign public Reel .getReel()
	* @returns The current reel, or null if there is no active reel
	*
	* @sign public Reel .getReel(reelId)
	* @param reelId - The id of the reel to fetch.
	* @returns The specified reel, or `undefined` if no such reel exists.
	*
	*/
	getReel: function (reelId) {
		if (arguments.length === 0){
			if (!this._currentReelId) return null;
			reelId = this._currentReelId;
		}

		return this._reels[reelId];
	}
});

/**@
 * #Tween
 * @category Animation
 * @trigger TweenEnd - when a tween finishes - String - property
 *
 * Component to animate the change in 2D properties over time.
 */
Crafty.c("Tween", {

	init: function(){
		this.tweenGroup = {};
		this.tweenStart = {};
		this.tweens = [];
		this.bind("EnterFrame", this._tweenTick);

	},

	_tweenTick: function(frameData){
		var tween, v, i;
		for ( i = this.tweens.length-1; i>=0; i--){
			tween = this.tweens[i];
			tween.easing.tick(frameData.dt);
			v  = tween.easing.value();
			this._doTween(tween.props, v);
			if (tween.easing.complete) {
				this.tweens.splice(i, 1);
				this._endTween(tween.props);
			}
		}
	},

	_doTween: function(props, v){
		for (var name in props)
			this[name] = (1-v) * this.tweenStart[name] + v * props[name];

	},



	/**@
	* #.tween
	* @comp Tween
	* @sign public this .tween(Object properties, Number|String duration)
	* @param properties - Object of numeric properties and what they should animate to
	* @param duration - Duration to animate the properties over, in milliseconds.
	*
	* This method will animate numeric properties over the specified duration.
	* These include `x`, `y`, `w`, `h`, `alpha` and `rotation`.
	*
	* The object passed should have the properties as keys and the value should be the resulting
	* values of the properties.  The passed object might be modified if later calls to tween animate the same properties.
	*
	* @example
	* Move an object to 100,100 and fade out over 200 ms.
	* ~~~
	* Crafty.e("2D, Tween")
	*    .attr({alpha: 1.0, x: 0, y: 0})
	*    .tween({alpha: 0.0, x: 100, y: 100}, 200)
	* ~~~
	* @example
	* Rotate an object over 2 seconds
	* ~~~
	* Crafty.e("2D, Tween")
	*    .attr({rotate:0})
	*    .tween({rotate:180}, 2000)
	* ~~~
	*
	*/
	tween: function (props, duration) {

		var tween = {
			props: props,
			easing: new Crafty.easing(duration)
		};

		// Tweens are grouped together by the original function call.
		// Individual properties must belong to only a single group
		// When a new tween starts, if it already belongs to a group, move it to the new one
		// Record the group it currently belongs to, as well as its starting coordinate.
		for (var propname in props){
			if (typeof this.tweenGroup[propname] !== "undefined")
				this.cancelTween(propname);
			this.tweenStart[propname] = this[propname];
			this.tweenGroup[propname] = props;
		}
		this.tweens.push(tween);

		return this;

	},

	/**@
	* #.cancelTween
	* @comp Tween
	* @sign public this .cancelTween(String target)
	* @param target - The property to cancel
	*
	* @sign public this .cancelTween(Object target)
	* @param target - An object containing the properties to cancel.
	*
	* Stops tweening the specified property or properties.
	* Passing the object used to start the tween might be a typical use of the second signature.
	*/
	cancelTween: function(target){
		if (typeof target === "string"){
			if (typeof this.tweenGroup[target] == "object" )
				delete this.tweenGroup[target][target];
		} else if (typeof target === "object") {
			for (var propname in target)
				this.cancelTween(propname);
		}

		return this;

	},

	/*
	* Stops tweening the specified group of properties, and fires the "TweenEnd" event.
	*/
	_endTween: function(properties){
		for (var propname in properties){
			delete this.tweenGroup[propname];
		}
		this.trigger("TweenEnd", properties);
	}
});

},{"./core.js":7}],4:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Canvas
 * @category Graphics
 * @trigger Draw - when the entity is ready to be drawn to the stage - {type: "canvas", pos, co, ctx}
 * @trigger NoCanvas - if the browser does not support canvas
 *
 * When this component is added to an entity it will be drawn to the global canvas element. The canvas element (and hence all Canvas entities) is always rendered below any DOM entities.
 *
 * Crafty.canvas.init() will be automatically called if it is not called already to initialize the canvas element.
 *
 * Create a canvas entity like this
 * ~~~
 * var myEntity = Crafty.e("2D, Canvas, Color")
 *      .color("green")
 *      .attr({x: 13, y: 37, w: 42, h: 42});
 *~~~
 */
Crafty.c("Canvas", {

    init: function () {
        if (!Crafty.canvas.context) {
            Crafty.canvas.init();
        }

        //increment the amount of canvas objs
        Crafty.DrawManager.total2D++;
        //Allocate an object to hold this components current region
        this.currentRect = {};
        this._changed = true;
        Crafty.DrawManager.addCanvas(this);

        this.bind("Invalidate", function (e) {
            //flag if changed
            if (this._changed === false) {
                this._changed = true;
                Crafty.DrawManager.addCanvas(this);
            }

        });


        this.bind("Remove", function () {
            Crafty.DrawManager.total2D--;
            this._changed = true;
            Crafty.DrawManager.addCanvas(this);
        });
    },

    /**@
     * #.draw
     * @comp Canvas
     * @sign public this .draw([[Context ctx, ]Number x, Number y, Number w, Number h])
     * @param ctx - Canvas 2D context if drawing on another canvas is required
     * @param x - X offset for drawing a segment
     * @param y - Y offset for drawing a segment
     * @param w - Width of the segment to draw
     * @param h - Height of the segment to draw
     *
     * Method to draw the entity on the canvas element. Can pass rect values for redrawing a segment of the entity.
     */

    // Cache the various objects and arrays used in draw:
    drawVars: {
        type: "canvas",
        pos: {},
        ctx: null,
        coord: [0, 0, 0, 0],
        co: {
            x: 0,
            y: 0,
            w: 0,
            h: 0
        }


    },

    draw: function (ctx, x, y, w, h) {
        if (!this.ready) return;
        if (arguments.length === 4) {
            h = w;
            w = y;
            y = x;
            x = ctx;
            ctx = Crafty.canvas.context;
        }
        console.log('draw');

        var pos = this.drawVars.pos;
        pos._x = (this._x + (x || 0));
        pos._y = (this._y + (y || 0));
        pos._w = (w || this._w);
        pos._h = (h || this._h);


        context = ctx || Crafty.canvas.context;
        coord = this.__coord || [0, 0, 0, 0];
        var co = this.drawVars.co;
        co.x = coord[0] + (x || 0);
        co.y = coord[1] + (y || 0);
        co.w = w || coord[2];
        co.h = h || coord[3];

        if (this._rotation !== 0) {
            context.save();

            context.translate(this._origin.x + this._x, this._origin.y + this._y);
            pos._x = -this._origin.x;
            pos._y = -this._origin.y;

            context.rotate((this._rotation % 360) * (Math.PI / 180));
        }

        if (this._flipX || this._flipY) {
            context.save();
            context.scale((this._flipX ? -1 : 1), (this._flipY ? -1 : 1));
            if (this._flipX) {
                pos._x = -(pos._x + pos._w);
            }
            if (this._flipY) {
                pos._y = -(pos._y + pos._h);
            }
        }

        var globalpha;

        //draw with alpha
        if (this._alpha < 1.0) {
            globalpha = context.globalAlpha;
            context.globalAlpha = this._alpha;
        }

        this.drawVars.ctx = context;
        this.trigger("Draw", this.drawVars);

        if (this._rotation !== 0 || (this._flipX || this._flipY)) {
            context.restore();
        }
        if (globalpha) {
            context.globalAlpha = globalpha;
        }
        return this;
    }
});

/**@
 * #Crafty.canvas
 * @category Graphics
 *
 * Collection of methods to draw on canvas.
 */
Crafty.extend({
    canvas: {
        /**@
         * #Crafty.canvas.context
         * @comp Crafty.canvas
         *
         * This will return the 2D context of the main canvas element.
         * The value returned from `Crafty.canvas._canvas.getContext('2d')`.
         */
        context: null,
        /**@
         * #Crafty.canvas._canvas
         * @comp Crafty.canvas
         *
         * Main Canvas element
         */

        /**@
         * #Crafty.canvas.init
         * @comp Crafty.canvas
         * @sign public void Crafty.canvas.init(void)
         * @trigger NoCanvas - triggered if `Crafty.support.canvas` is false
         *
         * Creates a `canvas` element inside `Crafty.stage.elem`. Must be called
         * before any entities with the Canvas component can be drawn.
         *
         * This method will automatically be called if no `Crafty.canvas.context` is
         * found.
         */
        init: function () {
            //check if canvas is supported
            if (!Crafty.support.canvas) {
                Crafty.trigger("NoCanvas");
                Crafty.stop();
                return;
            }

            //create an empty canvas element

            //Set any existing transformations
            var zoom = Crafty.viewport._scale;
            if (zoom != 1)
                Crafty.canvas.context.scale(zoom, zoom);

            //Bind rendering of canvas context (see drawing.js)
            Crafty.uniqueBind("RenderScene", Crafty.DrawManager.renderCanvas);

            Crafty.uniqueBind("ViewportResize", this._resize);
        },

        // Resize the canvas element to the current viewport
        _resize: function() {
            var c = Crafty.canvas._canvas;
            c.width = Crafty.viewport.width;
            c.height = Crafty.viewport.height;

        }

    }
});

},{"./core.js":7}],5:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document,
    DEG_TO_RAD = Math.PI / 180;

/**@
 * #Collision
 * @category 2D
 * Component to detect collision between any two convex polygons.
 */
Crafty.c("Collision", {
    /**@
     * #.init
     * @comp Collision
     * Create a rectangle polygon based on the x, y, w, h dimensions.
     *
     * By default, the collision hitbox will match the dimensions (x, y, w, h) and rotation of the object.
     */
    init: function () {
        this.requires("2D");
        this.collision();
    },


    // Run by Crafty when the component is removed
    remove: function() {
        this._cbr = null;
        this.unbind("Resize", this._resizeMap);
        this.unbind("Resize", this._checkBounds);
    },

    /**@
     * #.collision
     * @comp Collision
     *
     * @trigger NewHitbox - when a new hitbox is assigned - Crafty.polygon
     *
     * @sign public this .collision([Crafty.polygon polygon])
     * @param polygon - Crafty.polygon object that will act as the hit area
     *
     * @sign public this .collision(Array point1, .., Array pointN)
     * @param point# - Array with an `x` and `y` position to generate a polygon
     *
     * Constructor takes a polygon or array of points to use as the hit area.
     *
     * The hit area (polygon) must be a convex shape and not concave
     * for the collision detection to work.
     *
     * Points are relative to the object's position and its unrotated state.
     *
     * If no parameter is passed, the x, y, w, h properties of the entity will be used, and the hitbox will be resized when the entity is.
     *
     * If a hitbox is set that is outside of the bounds of the entity itself, there will be a small performance penalty as it is tracked separately.
     *
     * @example
     * ~~~
     * Crafty.e("2D, Collision").collision(
     *     new Crafty.polygon([50,0], [100,100], [0,100])
     * );
     *
     * Crafty.e("2D, Collision").collision([50,0], [100,100], [0,100]);
     * ~~~
     *
     * @see Crafty.polygon
     */
    collision: function (poly) {
        // Unbind anything bound to "Resize"
        this.unbind("Resize", this._resizeMap);
        this.unbind("Resize", this._checkBounds);

        

        if (!poly) {
            // If no polygon is specified, then a polygon is created that matches the bounds of the entity
            // It will be adjusted on a "Resize" event
            poly = new Crafty.polygon([0, 0], [this._w, 0], [this._w, this._h], [0, this._h]);
            this.bind("Resize", this._resizeMap);
            this._cbr = null;
        } else {
            // Otherwise, we set the specified hitbox, converting from a list of arguments to a polygon if necessary
            if (arguments.length > 1) {
                //convert args to array to create polygon
                var args = Array.prototype.slice.call(arguments, 0);
                poly = new Crafty.polygon(args);
            }
            // Check to see if the polygon sits outside the entity, and set _cbr appropriately
            // On resize, the new bounds will be checked if necessary
            this._findBounds(poly.points);
        }


        // If the entity is currently rotated, the points in the hitbox must also be rotated
        if (this.rotation) {
            poly.rotate({
                cos: Math.cos(-this.rotation * DEG_TO_RAD),
                sin: Math.sin(-this.rotation * DEG_TO_RAD),
                o: {
                    x: this._origin.x,
                    y: this._origin.y
                }
            });
        }

        // Finally, assign the hitbox, and attach it to the "Collision" entity
        this.map = poly;
        this.attach(this.map);
        this.map.shift(this._x, this._y);
        this.trigger("NewHitbox", poly);
        return this;
    },


    // If the hitbox is set by hand, it might extend beyond the entity.
    // In such a case, we need to track this separately.
    // This function finds a (non-minimal) bounding circle around the hitbox.
    //
    // It uses a pretty naive algorithm to do so, for more complicated options see [wikipedia](http://en.wikipedia.org/wiki/Bounding_sphere).
    _findBounds: function(points) {
        var minX = Infinity, maxX = -Infinity, minY=Infinity, maxY=-Infinity;
        var p;

        // Calculate the MBR of the points by finding the min/max x and y
        for (var i=0; i<points.length; ++i){
            p = points[i];
            if (p[0] < minX)
                minX = p[0];
            if (p[0] > maxX)
                maxX = p[0];
            if (p[1] < minY)
                minY = p[1];
            if (p[1] > maxY)
                maxY = p[1];
        }

        // This describes a circle centered on the MBR of the points, with a diameter equal to its diagonal
        // It will be used to find a rough bounding box round the points, even if they've been rotated
        var cbr = {
                cx: (minX + maxX) / 2,
                cy: (minY + maxY) / 2,
                r: Math.sqrt( (maxX - minX)*(maxX - minX) + (maxY - minY)*(maxY - minY))/2,
        };

        // We need to worry about resizing, but only if resizing could possibly change whether the hitbox is in or out of bounds
        // Thus if the upper-left corner is out of bounds, then there's no need to recheck on resize
        if (minX >= 0 && minY >= 0) {
            this._checkBounds = function() {
                if (this._cbr === null && this._w < maxX || this._h < maxY ){
                   this._cbr = cbr;
                   this._calculateMBR();
                } else if (this._cbr) {
                    this._cbr = null;
                    this._calculateMBR();
                }
            };
            this.bind("Resize", this._checkBounds);
        }
        
        // If the hitbox is within the entity, _cbr is null
        // Otherwise, set it, and immediately calculate the bounding box.
        if (minX >= 0 && minY >= 0 && maxX <= this._w && maxY <= this._h){
            this._cbr = null;
            return false;
        } else {
            this._cbr = cbr;
            this._calculateMBR();
            return true;
        }
        
    },

    // The default behavior is to match the hitbox to the entity.  
    // This function will change the hitbox when a "Resize" event triggers. 
    _resizeMap: function (e) {

        var dx, dy, rot = this.rotation * DEG_TO_RAD,
            points = this.map.points;

        // Depending on the change of axis, move the corners of the rectangle appropriately
        if (e.axis === 'w') {

            if (rot) {
                dx = e.amount * Math.cos(rot);
                dy = e.amount * Math.sin(rot);
            } else {
                dx = e.amount;
                dy = 0;
            }

            // "top right" point shifts on change of w
            points[1][0] += dx;
            points[1][1] += dy;
        } else {

            if (rot) {
                dy = e.amount * Math.cos(rot);
                dx = -e.amount * Math.sin(rot);
            } else {
                dx = 0;
                dy = e.amount;
            }

            // "bottom left" point shifts on change of h
            points[3][0] += dx;
            points[3][1] += dy;
        }

        // "bottom right" point shifts on either change
        points[2][0] += dx;
        points[2][1] += dy;

    },

    /**@
     * #.hit
     * @comp Collision
     * @sign public Boolean/Array hit(String component)
     * @param component - Check collision with entities that has this component
     * @return `false` if no collision. If a collision is detected, returns an Array of objects that are colliding.
     *
     * Takes an argument for a component to test collision for. If a collision is found, an array of
     * every object in collision along with the amount of overlap is passed.
     *
     * If no collision, will return false. The return collision data will be an Array of Objects with the
     * type of collision used, the object collided and if the type used was SAT (a polygon was used as the hitbox) then an amount of overlap.\
     * ~~~
     * [{
     *    obj: [entity],
     *    type: "MBR" or "SAT",
     *    overlap: [number]
     * }]
     * ~~~
     * `MBR` is your standard axis aligned rectangle intersection (`.intersect` in the 2D component).
     * `SAT` is collision between any convex polygon.
     *
     * @see .onHit, 2D
     */
    hit: function (comp) {
        var area = this._cbr || this._mbr || this,
            results = Crafty.map.search(area, false),
            i = 0,
            l = results.length,
            dupes = {},
            id, obj, oarea, key,
            hasMap = ('map' in this && 'containsPoint' in this.map),
            finalresult = [];

        if (!l) {
            return false;
        }

        for (; i < l; ++i) {
            obj = results[i];
            oarea = obj._cbr || obj._mbr || obj; //use the mbr

            if (!obj) continue;
            id = obj[0];

            //check if not added to hash and that actually intersects
            if (!dupes[id] && this[0] !== id && obj.__c[comp] &&
                oarea._x < area._x + area._w && oarea._x + oarea._w > area._x &&
                oarea._y < area._y + area._h && oarea._h + oarea._y > area._y)
                dupes[id] = obj;
        }

        for (key in dupes) {
            obj = dupes[key];

            if (hasMap && 'map' in obj) {
                var SAT = this._SAT(this.map, obj.map);
                SAT.obj = obj;
                SAT.type = "SAT";
                if (SAT) finalresult.push(SAT);
            } else {
                finalresult.push({
                    obj: obj,
                    type: "MBR"
                });
            }
        }

        if (!finalresult.length) {
            return false;
        }

        return finalresult;
    },

    /**@
     * #.onHit
     * @comp Collision
     * @sign public this .onHit(String component, Function hit[, Function noHit])
     * @param component - Component to check collisions for
     * @param hit - Callback method to execute upon collision with component.  Will be passed the results of the collision check in the same format documented for hit().
     * @param noHit - Callback method executed once as soon as collision stops
     *
     * Creates an EnterFrame event calling .hit() each frame.  When a collision is detected the callback will be invoked.
     *
     * @see .hit
     */
    onHit: function (comp, callback, callbackOff) {
        var justHit = false;
        this.bind("EnterFrame", function () {
            var hitdata = this.hit(comp);
            if (hitdata) {
                justHit = true;
                callback.call(this, hitdata);
            } else if (justHit) {
                if (typeof callbackOff == 'function') {
                    callbackOff.call(this);
                }
                justHit = false;
            }
        });
        return this;
    },

    _SAT: function (poly1, poly2) {
        var points1 = poly1.points,
            points2 = poly2.points,
            i = 0,
            l = points1.length,
            j, k = points2.length,
            normal = {
                x: 0,
                y: 0
            },
            length,
            min1, min2,
            max1, max2,
            interval,
            MTV = null,
            MTV2 = null,
            MN = null,
            dot,
            nextPoint,
            currentPoint;

        //loop through the edges of Polygon 1
        for (; i < l; i++) {
            nextPoint = points1[(i == l - 1 ? 0 : i + 1)];
            currentPoint = points1[i];

            //generate the normal for the current edge
            normal.x = -(nextPoint[1] - currentPoint[1]);
            normal.y = (nextPoint[0] - currentPoint[0]);

            //normalize the vector
            length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
            normal.x /= length;
            normal.y /= length;

            //default min max
            min1 = min2 = -1;
            max1 = max2 = -1;

            //project all vertices from poly1 onto axis
            for (j = 0; j < l; ++j) {
                dot = points1[j][0] * normal.x + points1[j][1] * normal.y;
                if (dot > max1 || max1 === -1) max1 = dot;
                if (dot < min1 || min1 === -1) min1 = dot;
            }

            //project all vertices from poly2 onto axis
            for (j = 0; j < k; ++j) {
                dot = points2[j][0] * normal.x + points2[j][1] * normal.y;
                if (dot > max2 || max2 === -1) max2 = dot;
                if (dot < min2 || min2 === -1) min2 = dot;
            }

            //calculate the minimum translation vector should be negative
            if (min1 < min2) {
                interval = min2 - max1;

                normal.x = -normal.x;
                normal.y = -normal.y;
            } else {
                interval = min1 - max2;
            }

            //exit early if positive
            if (interval >= 0) {
                return false;
            }

            if (MTV === null || interval > MTV) {
                MTV = interval;
                MN = {
                    x: normal.x,
                    y: normal.y
                };
            }
        }

        //loop through the edges of Polygon 2
        for (i = 0; i < k; i++) {
            nextPoint = points2[(i == k - 1 ? 0 : i + 1)];
            currentPoint = points2[i];

            //generate the normal for the current edge
            normal.x = -(nextPoint[1] - currentPoint[1]);
            normal.y = (nextPoint[0] - currentPoint[0]);

            //normalize the vector
            length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
            normal.x /= length;
            normal.y /= length;

            //default min max
            min1 = min2 = -1;
            max1 = max2 = -1;

            //project all vertices from poly1 onto axis
            for (j = 0; j < l; ++j) {
                dot = points1[j][0] * normal.x + points1[j][1] * normal.y;
                if (dot > max1 || max1 === -1) max1 = dot;
                if (dot < min1 || min1 === -1) min1 = dot;
            }

            //project all vertices from poly2 onto axis
            for (j = 0; j < k; ++j) {
                dot = points2[j][0] * normal.x + points2[j][1] * normal.y;
                if (dot > max2 || max2 === -1) max2 = dot;
                if (dot < min2 || min2 === -1) min2 = dot;
            }

            //calculate the minimum translation vector should be negative
            if (min1 < min2) {
                interval = min2 - max1;

                normal.x = -normal.x;
                normal.y = -normal.y;
            } else {
                interval = min1 - max2;


            }

            //exit early if positive
            if (interval >= 0) {
                return false;
            }

            if (MTV === null || interval > MTV) MTV = interval;
            if (interval > MTV2 || MTV2 === null) {
                MTV2 = interval;
                MN = {
                    x: normal.x,
                    y: normal.y
                };
            }
        }

        return {
            overlap: MTV2,
            normal: MN
        };
    }
});

},{"./core.js":7}],6:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    over: null, //object mouseover, waiting for out
    mouseObjs: 0,
    mousePos: {},
    lastEvent: null,
    keydown: {},
    selected: false,

    /**@
     * #Crafty.keydown
     * @category Input
     * Remembering what keys (referred by Unicode) are down.
     *
     * @example
     * ~~~
     * Crafty.c("Keyboard", {
     *   isDown: function (key) {
     *     if (typeof key === "string") {
     *       key = Crafty.keys[key];
     *     }
     *     return !!Crafty.keydown[key];
     *   }
     * });
     * ~~~
     * @see Keyboard, Crafty.keys
     */

    detectBlur: function (e) {
        var selected = ((e.clientX > Crafty.stage.x && e.clientX < Crafty.stage.x + Crafty.viewport.width) &&
            (e.clientY > Crafty.stage.y && e.clientY < Crafty.stage.y + Crafty.viewport.height));

        if (!Crafty.selected && selected)
            Crafty.trigger("CraftyFocus");
        if (Crafty.selected && !selected)
            Crafty.trigger("CraftyBlur");

        Crafty.selected = selected;
    },
    /**@
     * #Crafty.mouseDispatch
     * @category Input
     *
     * Internal method which dispatches mouse events received by Crafty (crafty.stage.elem).
     * The mouse events get dispatched to the closest entity to the source of the event (if available).
     *
     * This method also sets a global property Crafty.lastEvent, which holds the most recent event that
     * occured (useful for determining mouse position in every frame).
     * ~~~
     * var newestX = Crafty.lastEvent.realX,
     *     newestY = Crafty.lastEvent.realY;
     * ~~~
     *
     * Notable properties of a MouseEvent e:
     * ~~~
     * //(x,y) coordinates of mouse event in web browser screen space
     * e.clientX, e.clientY	
     * //(x,y) coordinates of mouse event in world/viewport space
     * e.realX, e.realY		
     * // Normalized mouse button according to Crafty.mouseButtons
     * e.mouseButton			
     * ~~~
     * @see Crafty.touchDispatch
     */
    mouseDispatch: function (e) {

        if (!Crafty.mouseObjs) return;
        Crafty.lastEvent = e;

        var maxz = -1,
            closest,
            q,
            i = 0,
            l,
            pos = Crafty.DOM.translate(e.clientX, e.clientY),
            x, y,
            dupes = {},
            tar = e.target ? e.target : e.srcElement,
            type = e.type;

        //Normalize button according to http://unixpapa.com/js/mouse.html
        if (typeof e.which === 'undefined') {
            e.mouseButton = (e.button < 2) ? Crafty.mouseButtons.LEFT : ((e.button == 4) ? Crafty.mouseButtons.MIDDLE : Crafty.mouseButtons.RIGHT);
        } else {
            e.mouseButton = (e.which < 2) ? Crafty.mouseButtons.LEFT : ((e.which == 2) ? Crafty.mouseButtons.MIDDLE : Crafty.mouseButtons.RIGHT);
        }

        e.realX = x = Crafty.mousePos.x = pos.x;
        e.realY = y = Crafty.mousePos.y = pos.y;

        //if it's a DOM element with Mouse component we are done
        if (tar.nodeName != "CANVAS") {
            while (typeof (tar.id) != 'string' && tar.id.indexOf('ent') == -1) {
                tar = tar.parentNode;
            }
            ent = Crafty(parseInt(tar.id.replace('ent', ''), 10));
            if (ent.has('Mouse') && ent.isAt(x, y))
                closest = ent;
        }
        //else we search for an entity with Mouse component
        if (!closest) {
            q = Crafty.map.search({
                _x: x,
                _y: y,
                _w: 1,
                _h: 1
            }, false);

            for (l = q.length; i < l; ++i) {
                if (!q[i].__c.Mouse || !q[i]._visible) continue;

                var current = q[i],
                    flag = false;

                //weed out duplicates
                if (dupes[current[0]]) continue;
                else dupes[current[0]] = true;

                if (current.mapArea) {
                    if (current.mapArea.containsPoint(x, y)) {
                        flag = true;
                    }
                } else if (current.isAt(x, y)) flag = true;

                if (flag && (current._z >= maxz || maxz === -1)) {
                    //if the Z is the same, select the closest GUID
                    if (current._z === maxz && current[0] < closest[0]) {
                        continue;
                    }
                    maxz = current._z;
                    closest = current;
                }
            }
        }

        //found closest object to mouse
        if (closest) {
            //click must mousedown and out on tile
            if (type === "mousedown") {
                closest.trigger("MouseDown", e);
            } else if (type === "mouseup") {
                closest.trigger("MouseUp", e);
            } else if (type == "dblclick") {
                closest.trigger("DoubleClick", e);
            } else if (type == "click") {
                closest.trigger("Click", e);
            } else if (type === "mousemove") {
                closest.trigger("MouseMove", e);
                if (this.over !== closest) { //if new mousemove, it is over
                    if (this.over) {
                        this.over.trigger("MouseOut", e); //if over wasn't null, send mouseout
                        this.over = null;
                    }
                    this.over = closest;
                    closest.trigger("MouseOver", e);
                }
            } else closest.trigger(type, e); //trigger whatever it is
        } else {
            if (type === "mousemove" && this.over) {
                this.over.trigger("MouseOut", e);
                this.over = null;
            }
            if (type === "mousedown") {
                Crafty.viewport.mouselook('start', e);
            } else if (type === "mousemove") {
                Crafty.viewport.mouselook('drag', e);
            } else if (type == "mouseup") {
                Crafty.viewport.mouselook('stop');
            }
        }

        if (type === "mousemove") {
            this.lastEvent = e;
        }

    },


    /**@
     * #Crafty.touchDispatch
     * @category Input
     *
     * TouchEvents have a different structure then MouseEvents.
     * The relevant data lives in e.changedTouches[0].
     * To normalize TouchEvents we catch them and dispatch a mock MouseEvent instead.
     *
     * @see Crafty.mouseDispatch
     */

    touchDispatch: function (e) {
        var type,
            lastEvent = Crafty.lastEvent;

        if (e.type === "touchstart") type = "mousedown";
        else if (e.type === "touchmove") type = "mousemove";
        else if (e.type === "touchend") type = "mouseup";
        else if (e.type === "touchcancel") type = "mouseup";
        else if (e.type === "touchleave") type = "mouseup";

        if (e.touches && e.touches.length) {
            first = e.touches[0];
        } else if (e.changedTouches && e.changedTouches.length) {
            first = e.changedTouches[0];
        }

        // var simulatedEvent = document.createEvent("MouseEvent");
        // simulatedEvent.initMouseEvent(type, true, true, window, 1,
        //     first.screenX,
        //     first.screenY,
        //     first.clientX,
        //     first.clientY,
        //     false, false, false, false, 0, e.relatedTarget
        // );

        // first.target.dispatchEvent(simulatedEvent);

        // // trigger click when it should be triggered
        // if (lastEvent !== null && lastEvent.type == 'mousedown' && type == 'mouseup') {
        //     type = 'click';

        //     simulatedEvent = document.createEvent("MouseEvent");
        //     simulatedEvent.initMouseEvent(type, true, true, window, 1,
        //         first.screenX,
        //         first.screenY,
        //         first.clientX,
        //         first.clientY,
        //         false, false, false, false, 0, e.relatedTarget
        //     );
        //     first.target.dispatchEvent(simulatedEvent);
        // }

        //Don't prevent default actions if target node is input or textarea.
        if (e.target && e.target.nodeName !== 'INPUT' && e.target.nodeName !== 'TEXTAREA') {
            if (e.preventDefault) {
                e.preventDefault();
            } else {
                e.returnValue = false;
            }
        }
    },


    /**@
     * #KeyboardEvent
     * @category Input
     * Keyboard Event triggered by Crafty Core
     * @trigger KeyDown - is triggered for each entity when the DOM 'keydown' event is triggered.
     * @trigger KeyUp - is triggered for each entity when the DOM 'keyup' event is triggered.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Color")
     *   .attr({x: 100, y: 100, w: 50, h: 50})
     *   .color("red")
     *   .bind('KeyDown', function(e) {
     *     if(e.key == Crafty.keys.LEFT_ARROW) {
     *       this.x = this.x-1;
     *     } else if (e.key == Crafty.keys.RIGHT_ARROW) {
     *       this.x = this.x+1;
     *     } else if (e.key == Crafty.keys.UP_ARROW) {
     *       this.y = this.y-1;
     *     } else if (e.key == Crafty.keys.DOWN_ARROW) {
     *       this.y = this.y+1;
     *     }
     *   });
     * ~~~
     *
     * @see Crafty.keys
     */

    /**@
     * #Crafty.eventObject
     * @category Input
     *
     * Event Object used in Crafty for cross browser compatibility
     */

    /**@
     * #.key
     * @comp Crafty.eventObject
     *
     * Unicode of the key pressed
     */
    keyboardDispatch: function (e) {
        // Use a Crafty-standard event object to avoid cross-browser issues
        var original = e,
            evnt = {},
            props = "char charCode keyCode type shiftKey ctrlKey metaKey timestamp".split(" ");
        for (var i = props.length; i;) {
            var prop = props[--i];
            evnt[prop] = original[prop];
        }
        evnt.which = original.charCode !== null ? original.charCode : original.keyCode;
        evnt.key = original.keyCode || original.which;
        evnt.originalEvent = original;
        e = evnt;

        if (e.type === "keydown") {
            if (Crafty.keydown[e.key] !== true) {
                Crafty.keydown[e.key] = true;
                Crafty.trigger("KeyDown", e);
            }
        } else if (e.type === "keyup") {
            delete Crafty.keydown[e.key];
            Crafty.trigger("KeyUp", e);
        }

        //prevent default actions for all keys except backspace and F1-F12 and except actions in INPUT and TEXTAREA.
        //prevent bubbling up for all keys except backspace and F1-F12.
        //Among others this prevent the arrow keys from scrolling the parent page
        //of an iframe hosting the game
        if (Crafty.selected && !(e.key == 8 || e.key >= 112 && e.key <= 135)) {
            if (e.stopPropagation) e.stopPropagation();
            else e.cancelBubble = true;

            //Don't prevent default actions if target node is input or textarea.
            if (e.target && e.target.nodeName !== 'INPUT' && e.target.nodeName !== 'TEXTAREA') {
                if (e.preventDefault) {
                    e.preventDefault();
                } else {
                    e.returnValue = false;
                }
            }
            return false;
        }
    }
});

//initialize the input events onload
Crafty.bind("Load", function () {
    // Crafty.addEvent(this, "keydown", Crafty.keyboardDispatch);
    // Crafty.addEvent(this, "keyup", Crafty.keyboardDispatch);

    Crafty.addEvent(this, Crafty.stage.elem, "mousedown", Crafty.mouseDispatch);
    Crafty.addEvent(this, Crafty.stage.elem, "mouseup", Crafty.mouseDispatch);
    // Crafty.addEvent(this, document.body, "mouseup", Crafty.detectBlur);
    Crafty.addEvent(this, Crafty.stage.elem, "mousemove", Crafty.mouseDispatch);
    Crafty.addEvent(this, Crafty.stage.elem, "click", Crafty.mouseDispatch);
    Crafty.addEvent(this, Crafty.stage.elem, "dblclick", Crafty.mouseDispatch);

    // Crafty.addEvent(this, Crafty.stage.elem, "touchstart", Crafty.touchDispatch);
    Crafty.addEvent(this, Crafty.stage.elem, "touchmove", Crafty.touchDispatch);
    // Crafty.addEvent(this, Crafty.stage.elem, "touchend", Crafty.touchDispatch);
    Crafty.addEvent(this, Crafty.stage.elem, "touchcancel", Crafty.touchDispatch);
    // Crafty.addEvent(this, Crafty.stage.elem, "touchleave", Crafty.touchDispatch);
});

Crafty.bind("CraftyStop", function () {
    Crafty.removeEvent(this, "keydown", Crafty.keyboardDispatch);
    Crafty.removeEvent(this, "keyup", Crafty.keyboardDispatch);

    if (Crafty.stage) {
        Crafty.removeEvent(this, Crafty.stage.elem, "mousedown", Crafty.mouseDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "mouseup", Crafty.mouseDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "mousemove", Crafty.mouseDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "click", Crafty.mouseDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "dblclick", Crafty.mouseDispatch);

        Crafty.removeEvent(this, Crafty.stage.elem, "touchstart", Crafty.touchDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "touchmove", Crafty.touchDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "touchend", Crafty.touchDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "touchcancel", Crafty.touchDispatch);
        Crafty.removeEvent(this, Crafty.stage.elem, "touchleave", Crafty.touchDispatch);
    }

    // Crafty.removeEvent(this, document.body, "mouseup", Crafty.detectBlur);
});

/**@
 * #Mouse
 * @category Input
 * Provides the entity with mouse related events
 * @trigger MouseOver - when the mouse enters the entity - MouseEvent
 * @trigger MouseOut - when the mouse leaves the entity - MouseEvent
 * @trigger MouseDown - when the mouse button is pressed on the entity - MouseEvent
 * @trigger MouseUp - when the mouse button is released on the entity - MouseEvent
 * @trigger Click - when the user clicks the entity. [See documentation](http://www.quirksmode.org/dom/events/click.html) - MouseEvent
 * @trigger DoubleClick - when the user double clicks the entity - MouseEvent
 * @trigger MouseMove - when the mouse is over the entity and moves - MouseEvent
 * Crafty adds the mouseButton property to MouseEvents that match one of
 *
 * - Crafty.mouseButtons.LEFT
 * - Crafty.mouseButtons.RIGHT
 * - Crafty.mouseButtons.MIDDLE
 *
 * @example
 * ~~~
 * myEntity.bind('Click', function() {
 *      console.log("Clicked!!");
 * })
 *
 * myEntity.bind('MouseUp', function(e) {
 *    if( e.mouseButton == Crafty.mouseButtons.RIGHT )
 *        console.log("Clicked right button");
 * })
 * ~~~
 * @see Crafty.mouseDispatch
 */
Crafty.c("Mouse", {
    init: function () {
        Crafty.mouseObjs++;
        this.bind("Remove", function () {
            Crafty.mouseObjs--;
        });
    },

    /**@
     * #.areaMap
     * @comp Mouse
     * @sign public this .areaMap(Crafty.polygon polygon)
     * @param polygon - Instance of Crafty.polygon used to check if the mouse coordinates are inside this region
     * @sign public this .areaMap(Array point1, .., Array pointN)
     * @param point# - Array with an `x` and `y` position to generate a polygon
     *
     * Assign a polygon to the entity so that mouse events will only be triggered if
     * the coordinates are inside the given polygon.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Color, Mouse")
     *     .color("red")
     *     .attr({ w: 100, h: 100 })
     *     .bind('MouseOver', function() {console.log("over")})
     *     .areaMap([0,0], [50,0], [50,50], [0,50])
     * ~~~
     *
     * @see Crafty.polygon
     */
    areaMap: function (poly) {
        //create polygon
        if (arguments.length > 1) {
            //convert args to array to create polygon
            var args = Array.prototype.slice.call(arguments, 0);
            poly = new Crafty.polygon(args);
        }

        poly.shift(this._x, this._y);
        //this.map = poly;
        this.mapArea = poly;

        this.attach(this.mapArea);
        return this;
    }
});

/**@
 * #Draggable
 * @category Input
 * Enable drag and drop of the entity.
 * @trigger Dragging - is triggered each frame the entity is being dragged - MouseEvent
 * @trigger StartDrag - is triggered when dragging begins - MouseEvent
 * @trigger StopDrag - is triggered when dragging ends - MouseEvent
 */
Crafty.c("Draggable", {
    _origMouseDOMPos: null,
    _oldX: null,
    _oldY: null,
    _dragging: false,
    _dir: null,

    //Note: the code is not tested with zoom, etc., that may distort the direction between the viewport and the coordinate on the canvas.
    init: function () {
        this.requires("Mouse");
        this.enableDrag();
    },

    _ondrag: function (e) {
        // While a drag is occurring, this method is bound to the mousemove DOM event
        var pos = Crafty.DOM.translate(e.clientX, e.clientY);

        // ignore invalid 0 0 position - strange problem on ipad
        if (pos.x === 0 || pos.y === 0) {
            return false;
        }

        if (this._dir) {
            var len = (pos.x - this._origMouseDOMPos.x) * this._dir.x + (pos.y - this._origMouseDOMPos.y) * this._dir.y;
            this.x = this._oldX + len * this._dir.x;
            this.y = this._oldY + len * this._dir.y;
        } else {
            this.x = this._oldX + (pos.x - this._origMouseDOMPos.x);
            this.y = this._oldY + (pos.y - this._origMouseDOMPos.y);
        }

        this.trigger("Dragging", e);
    },

    _ondown: function (e) {
        // When dragging is enabled, this method is bound to the MouseDown crafty event
        if (e.mouseButton !== Crafty.mouseButtons.LEFT) return;
        this._startDrag(e);
    },

    _onup: function (e) {
        // While a drag is occurring, this method is bound to mouseup DOM event
        if (this._dragging === true) {
            Crafty.removeEvent(this, Crafty.stage.elem, "mousemove", this._ondrag);
            Crafty.removeEvent(this, Crafty.stage.elem, "mouseup", this._onup);
            this._dragging = false;
            this.trigger("StopDrag", e);
        }
    },

    /**@
     * #.dragDirection
     * @comp Draggable
     * @sign public this .dragDirection()
     * Remove any previously specified direction.
     *
     * @sign public this .dragDirection(vector)
     * @param vector - Of the form of {x: valx, y: valy}, the vector (valx, valy) denotes the move direction.
     *
     * @sign public this .dragDirection(degree)
     * @param degree - A number, the degree (clockwise) of the move direction with respect to the x axis.
     * Specify the dragging direction.
     *
     * @example
     * ~~~
     * this.dragDirection()
     * this.dragDirection({x:1, y:0}) //Horizontal
     * this.dragDirection({x:0, y:1}) //Vertical
     * // Note: because of the orientation of x and y axis,
     * // this is 45 degree clockwise with respect to the x axis.
     * this.dragDirection({x:1, y:1}) //45 degree.
     * this.dragDirection(60) //60 degree.
     * ~~~
     */
    dragDirection: function (dir) {
        if (typeof dir === 'undefined') {
            this._dir = null;
        } else if (("" + parseInt(dir, 10)) == dir) { //dir is a number
            this._dir = {
                x: Math.cos(dir / 180 * Math.PI),
                y: Math.sin(dir / 180 * Math.PI)
            };
        } else {
            var r = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
            this._dir = {
                x: dir.x / r,
                y: dir.y / r
            };
        }
    },


    /**@
     * #._startDrag
     * @comp Draggable
     * Internal method for starting a drag of an entity either programatically or via Mouse click
     *
     * @param e - a mouse event
     */
    _startDrag: function (e) {
        this._origMouseDOMPos = Crafty.DOM.translate(e.clientX, e.clientY);
        this._oldX = this._x;
        this._oldY = this._y;
        this._dragging = true;

        Crafty.addEvent(this, Crafty.stage.elem, "mousemove", this._ondrag);
        Crafty.addEvent(this, Crafty.stage.elem, "mouseup", this._onup);
        this.trigger("StartDrag", e);
    },

    /**@
     * #.stopDrag
     * @comp Draggable
     * @sign public this .stopDrag(void)
     * @trigger StopDrag - Called right after the mouse listeners are removed
     *
     * Stop the entity from dragging. Essentially reproducing the drop.
     *
     * @see .startDrag
     */
    stopDrag: function () {
        Crafty.removeEvent(this, Crafty.stage.elem, "mousemove", this._ondrag);
        Crafty.removeEvent(this, Crafty.stage.elem, "mouseup", this._onup);

        this._dragging = false;
        this.trigger("StopDrag");
        return this;
    },

    /**@
     * #.startDrag
     * @comp Draggable
     * @sign public this .startDrag(void)
     *
     * Make the entity follow the mouse positions.
     *
     * @see .stopDrag
     */
    startDrag: function () {
        if (!this._dragging) {
            //Use the last known position of the mouse
            this._startDrag(Crafty.lastEvent);
        }
        return this;
    },

    /**@
     * #.enableDrag
     * @comp Draggable
     * @sign public this .enableDrag(void)
     *
     * Rebind the mouse events. Use if `.disableDrag` has been called.
     *
     * @see .disableDrag
     */
    enableDrag: function () {
        this.bind("MouseDown", this._ondown);

        Crafty.addEvent(this, Crafty.stage.elem, "mouseup", this._onup);
        return this;
    },

    /**@
     * #.disableDrag
     * @comp Draggable
     * @sign public this .disableDrag(void)
     *
     * Stops entity from being draggable. Reenable with `.enableDrag()`.
     *
     * @see .enableDrag
     */
    disableDrag: function () {
        this.unbind("MouseDown", this._ondown);
        if (this._dragging) {
            this.stopDrag();
        }
        return this;
    }
});

/**@
 * #Keyboard
 * @category Input
 * Give entities keyboard events (`keydown` and `keyup`).
 */
Crafty.c("Keyboard", {
    /**@
     * #.isDown
     * @comp Keyboard
     * @sign public Boolean isDown(String keyName)
     * @param keyName - Name of the key to check. See `Crafty.keys`.
     * @sign public Boolean isDown(Number keyCode)
     * @param keyCode - Key code in `Crafty.keys`.
     *
     * Determine if a certain key is currently down.
     *
     * @example
     * ~~~
     * entity.requires('Keyboard').bind('KeyDown', function () { if (this.isDown('SPACE')) jump(); });
     * ~~~
     *
     * @see Crafty.keys
     */
    isDown: function (key) {
        if (typeof key === "string") {
            key = Crafty.keys[key];
        }
        return !!Crafty.keydown[key];
    }
});

/**@
 * #Multiway
 * @category Input
 * Used to bind keys to directions and have the entity move accordingly
 * @trigger NewDirection - triggered when direction changes - { x:Number, y:Number } - New direction
 * @trigger Moved - triggered on movement on either x or y axis. If the entity has moved on both axes for diagonal movement the event is triggered twice - { x:Number, y:Number } - Old position
 */
Crafty.c("Multiway", {
    _speed: 3,

    _keydown: function (e) {
        if (this._keys[e.key]) {
            this._movement.x = Math.round((this._movement.x + this._keys[e.key].x) * 1000) / 1000;
            this._movement.y = Math.round((this._movement.y + this._keys[e.key].y) * 1000) / 1000;
            this.trigger('NewDirection', this._movement);
        }
    },

    _keyup: function (e) {
        if (this._keys[e.key]) {
            this._movement.x = Math.round((this._movement.x - this._keys[e.key].x) * 1000) / 1000;
            this._movement.y = Math.round((this._movement.y - this._keys[e.key].y) * 1000) / 1000;
            this.trigger('NewDirection', this._movement);
        }
    },

    _enterframe: function () {
        if (this.disableControls) return;

        if (this._movement.x !== 0) {
            this.x += this._movement.x;
            this.trigger('Moved', {
                x: this.x - this._movement.x,
                y: this.y
            });
        }
        if (this._movement.y !== 0) {
            this.y += this._movement.y;
            this.trigger('Moved', {
                x: this.x,
                y: this.y - this._movement.y
            });
        }
    },

    _initializeControl: function () {
        return this.unbind("KeyDown", this._keydown)
            .unbind("KeyUp", this._keyup)
            .unbind("EnterFrame", this._enterframe)
            .bind("KeyDown", this._keydown)
            .bind("KeyUp", this._keyup)
            .bind("EnterFrame", this._enterframe);
    },

    /**@
     * #.multiway
     * @comp Multiway
     * @sign public this .multiway([Number speed,] Object keyBindings )
     * @param speed - Amount of pixels to move the entity whilst a key is down
     * @param keyBindings - What keys should make the entity go in which direction. Direction is specified in degrees
     * Constructor to initialize the speed and keyBindings. Component will listen to key events and move the entity appropriately.
     *
     * When direction changes a NewDirection event is triggered with an object detailing the new direction: {x: x_movement, y: y_movement}
     * When entity has moved on either x- or y-axis a Moved event is triggered with an object specifying the old position {x: old_x, y: old_y}
     *
     * @example
     * ~~~
     * this.multiway(3, {UP_ARROW: -90, DOWN_ARROW: 90, RIGHT_ARROW: 0, LEFT_ARROW: 180});
     * this.multiway({x:3,y:1.5}, {UP_ARROW: -90, DOWN_ARROW: 90, RIGHT_ARROW: 0, LEFT_ARROW: 180});
     * this.multiway({W: -90, S: 90, D: 0, A: 180});
     * ~~~
     */
    multiway: function (speed, keys) {
        this._keyDirection = {};
        this._keys = {};
        this._movement = {
            x: 0,
            y: 0
        };
        this._speed = {
            x: 3,
            y: 3
        };

        if (keys) {
            if (speed.x !== undefined && speed.y !== undefined) {
                this._speed.x = speed.x;
                this._speed.y = speed.y;
            } else {
                this._speed.x = speed;
                this._speed.y = speed;
            }
        } else {
            keys = speed;
        }

        this._keyDirection = keys;
        this.speed(this._speed);

        this._initializeControl();

        //Apply movement if key is down when created
        for (var k in keys) {
            if (Crafty.keydown[Crafty.keys[k]]) {
                this.trigger("KeyDown", {
                    key: Crafty.keys[k]
                });
            }
        }

        return this;
    },

    /**@
     * #.enableControl
     * @comp Multiway
     * @sign public this .enableControl()
     *
     * Enable the component to listen to key events.
     *
     * @example
     * ~~~
     * this.enableControl();
     * ~~~
     */
    enableControl: function () {
        this.disableControls = false;
        return this;
    },

    /**@
     * #.disableControl
     * @comp Multiway
     * @sign public this .disableControl()
     *
     * Disable the component to listen to key events.
     *
     * @example
     * ~~~
     * this.disableControl();
     * ~~~
     */

    disableControl: function () {
        this.disableControls = true;
        return this;
    },

    speed: function (speed) {
        for (var k in this._keyDirection) {
            var keyCode = Crafty.keys[k] || k;
            this._keys[keyCode] = {
                x: Math.round(Math.cos(this._keyDirection[k] * (Math.PI / 180)) * 1000 * speed.x) / 1000,
                y: Math.round(Math.sin(this._keyDirection[k] * (Math.PI / 180)) * 1000 * speed.y) / 1000
            };
        }
        return this;
    }
});

/**@
 * #Fourway
 * @category Input
 * Move an entity in four directions by using the
 * arrow keys or `W`, `A`, `S`, `D`.
 */
Crafty.c("Fourway", {

    init: function () {
        this.requires("Multiway");
    },

    /**@
     * #.fourway
     * @comp Fourway
     * @sign public this .fourway(Number speed)
     * @param speed - Amount of pixels to move the entity whilst a key is down
     * Constructor to initialize the speed. Component will listen for key events and move the entity appropriately.
     * This includes `Up Arrow`, `Right Arrow`, `Down Arrow`, `Left Arrow` as well as `W`, `A`, `S`, `D`.
     *
     * When direction changes a NewDirection event is triggered with an object detailing the new direction: {x: x_movement, y: y_movement}
     * When entity has moved on either x- or y-axis a Moved event is triggered with an object specifying the old position {x: old_x, y: old_y}
     *
     * The key presses will move the entity in that direction by the speed passed in the argument.
     *
     * @see Multiway
     */
    fourway: function (speed) {
        this.multiway(speed, {
            UP_ARROW: -90,
            DOWN_ARROW: 90,
            RIGHT_ARROW: 0,
            LEFT_ARROW: 180,
            W: -90,
            S: 90,
            D: 0,
            A: 180,
            Z: -90,
            Q: 180
        });

        return this;
    }
});

/**@
 * #Twoway
 * @category Input
 * @trigger NewDirection - When direction changes a NewDirection event is triggered with an object detailing the new direction: {x: x_movement, y: y_movement}. This is consistent with Fourway and Multiway components.
 * @trigger Moved - When entity has moved on x-axis a Moved event is triggered with an object specifying the old position {x: old_x, y: old_y}
 * 
 * Move an entity left or right using the arrow keys or `D` and `A` and jump using up arrow or `W`.
 */
Crafty.c("Twoway", {
    _speed: 3,
    _up: false,

    init: function () {
        this.requires("Fourway, Keyboard, Gravity");
    },

    /**@
     * #.twoway
     * @comp Twoway
     * @sign public this .twoway(Number speed[, Number jump])
     * @param speed - Amount of pixels to move left or right
     * @param jump - Vertical jump speed
     *
     * Constructor to initialize the speed and power of jump. Component will
     * listen for key events and move the entity appropriately. This includes
     * `Up Arrow`, `Right Arrow`, `Left Arrow` as well as `W`, `A`, `D`. Used with the
     * `gravity` component to simulate jumping.
     *
     * The key presses will move the entity in that direction by the speed passed in
     * the argument. Pressing the `Up Arrow` or `W` will cause the entity to jump.
     *
     * @see Gravity, Fourway
     */
    twoway: function (speed, jump) {

        this.multiway(speed, {
            RIGHT_ARROW: 0,
            LEFT_ARROW: 180,
            D: 0,
            A: 180,
            Q: 180
        });

        if (speed) this._speed = speed;
        if (arguments.length < 2){
          this._jumpSpeed = this._speed * 2;
        } else{
          this._jumpSpeed = jump;
        }

        this.bind("EnterFrame", function () {
            if (this.disableControls) return;
            if (this._up) {
                this.y -= this._jumpSpeed;
                this._falling = true;
                this.trigger('Moved', { x: this._x, y: this._y + this._jumpSpeed });
            }
        }).bind("KeyDown", function (e) {
            if (!this._falling && (e.key === Crafty.keys.UP_ARROW || e.key === Crafty.keys.W || e.key === Crafty.keys.Z))
                this._up = true;
        });

        return this;
    }
});

},{"./core.js":7}],7:[function(require,module,exports){
var version = require('./version');

/**@
 * #Crafty
 * @category Core
 * Select a set of or single entities by components or an entity's ID.
 *
 * Crafty uses syntax similar to jQuery by having a selector engine to select entities by their components.
 *
 * If there is more than one match, the return value is an Array-like object listing the ID numbers of each matching entity. If there is exactly one match, the entity itself is returned. If you're not sure how many matches to expect, check the number of matches via Crafty(...).length. Alternatively, use Crafty(...).each(...), which works in all cases.
 *
 * @example
 * ~~~
 *    Crafty("MyComponent")
 *    Crafty("Hello 2D Component")
 *    Crafty("Hello, 2D, Component")
 * ~~~
 *
 * The first selector will return all entities that have the component `MyComponent`. The second will return all entities that have `Hello` and `2D` and `Component` whereas the last will return all entities that have at least one of those components (or).
 *
 * ~~~
 *   Crafty("*")
 * ~~~
 * Passing `*` will select all entities.
 *
 * ~~~
 *   Crafty(1)
 * ~~~
 * Passing an integer will select the entity with that `ID`.
 *
 * To work directly with an array of entities, use the `get()` method on a selection.
 * To call a function in the context of each entity, use the `.each()` method.
 *
 * The event related methods such as `bind` and `trigger` will work on selections of entities.
 *
 * @see .get
 * @see .each
 */

var Crafty = function (selector) {
    return new Crafty.fn.init(selector);
},
    // Internal variables
    GUID, frame, components, entities, handlers, onloads,
    slice, rlist, rspace, milliSecPerFrame;


    initState = function () {
        GUID = 1, //GUID for entity IDs
        frame = 0;

        components = {}; //map of components and their functions
        entities = {}; //map of entities and their data
        handlers = {}; //global event handlers
        onloads = []; //temporary storage of onload handlers

        slice = Array.prototype.slice;
        rlist = /\s*,\s*/;
        rspace = /\s+/;
    };

initState();

/**@
 * #Crafty Core
 * @category Core
 * @trigger NewEntityName - After setting new name for entity - String - entity name
 * @trigger NewComponent - when a new component is added to the entity - String - Component
 * @trigger RemoveComponent - when a component is removed from the entity - String - Component
 * @trigger Remove - when the entity is removed by calling .destroy()
 *
 * Set of methods added to every single entity.
 */
Crafty.fn = Crafty.prototype = {

    init: function (selector) {
        //select entities by component
        if (typeof selector === "string") {
            var elem = 0, //index elements
                e, //entity forEach
                current,
                and = false, //flags for multiple
                or = false,
                del,
                comps,
                score,
                i, l;

            if (selector === '*') {
                i = 0;
                for (e in entities) {
                    // entities is something like {2:entity2, 3:entity3, 11:entity11, ...}
                    // The for...in loop sets e to "2", "3", "11", ... i.e. all
                    // the entity ID numbers. e is a string, so +e converts to number type.
                    this[i] = +e;
                    i++;
                }
                this.length = i;
                // if there's only one entity, return the actual entity
                if (i === 1) {
                    return entities[this[0]];
                }
                return this;
            }

            //multiple components OR
            if (selector.indexOf(',') !== -1) {
                or = true;
                del = rlist;
                //deal with multiple components AND
            } else if (selector.indexOf(' ') !== -1) {
                and = true;
                del = rspace;
            }

            //loop over entities
            for (e in entities) {
                if (!entities.hasOwnProperty(e)) continue; //skip
                current = entities[e];

                if (and || or) { //multiple components
                    comps = selector.split(del);
                    i = 0;
                    l = comps.length;
                    score = 0;

                    for (; i < l; i++) //loop over components
                        if (current.__c[comps[i]]) score++; //if component exists add to score

                        //if anded comps and has all OR ored comps and at least 1
                    if (and && score === l || or && score > 0) this[elem++] = +e;

                } else if (current.__c[selector]) this[elem++] = +e; //convert to int
            }

            //extend all common components
            if (elem > 0 && !and && !or) this.extend(components[selector]);
            if (comps && and)
                for (i = 0; i < l; i++) this.extend(components[comps[i]]);

            this.length = elem; //length is the last index (already incremented)

            // if there's only one entity, return the actual entity
            if (elem === 1) {
                return entities[this[elem - 1]];
            }

        } else { //Select a specific entity

            if (!selector) { //nothin passed creates God entity
                selector = 0;
                if (!(selector in entities)) entities[selector] = this;
            }

            //if not exists, return undefined
            if (!(selector in entities)) {
                this.length = 0;
                return this;
            }

            this[0] = selector;
            this.length = 1;

            //update from the cache
            if (!this.__c) this.__c = {};

            //update to the cache if NULL
            if (!entities[selector]) entities[selector] = this;
            return entities[selector]; //return the cached selector
        }

        return this;
    },

    /**@
     * #.setName
     * @comp Crafty Core
     * @sign public this .setName(String name)
     * @param name - A human readable name for debugging purposes.
     *
     * @example
     * ~~~
     * this.setName("Player");
     * ~~~
     */
    setName: function (name) {
        var entityName = String(name);

        this._entityName = entityName;

        this.trigger("NewEntityName", entityName);
        return this;
    },

    /**@
     * #.addComponent
     * @comp Crafty Core
     * @sign public this .addComponent(String componentList)
     * @param componentList - A string of components to add separated by a comma `,`
     * @sign public this .addComponent(String Component1[, .., String ComponentN])
     * @param Component# - Component ID to add.
     * Adds a component to the selected entities or entity.
     *
     * Components are used to extend the functionality of entities.
     * This means it will copy properties and assign methods to
     * augment the functionality of the entity.
     *
     * For adding multiple components, you can either pass a string with
     * all the component names (separated by commas), or pass each component name as
     * an argument.
     *
     * If the component has a function named `init` it will be called.
     *
     * If the entity already has the component, the component is skipped (nothing happens).
     *
     * @example
     * ~~~
     * this.addComponent("2D, Canvas");
     * this.addComponent("2D", "Canvas");
     * ~~~
     */
    addComponent: function (id) {
        var uninit = [],
            c = 0,
            ul, //array of components to init
            i = 0,
            l, comps, comp;

        //add multiple arguments
        if (arguments.length > 1) {
            l = arguments.length;
            for (; i < l; i++) {
                uninit.push(arguments[i]);
            }
            //split components if contains comma
        } else if (id.indexOf(',') !== -1) {
            comps = id.split(rlist);
            l = comps.length;
            for (; i < l; i++) {
                uninit.push(comps[i]);
            }
            //single component passed
        } else {
            uninit.push(id);
        }

        //extend the components
        ul = uninit.length;
        for (; c < ul; c++) {
            if (this.__c[uninit[c]] === true)
                continue;
            this.__c[uninit[c]] = true;
            comp = components[uninit[c]];
            this.extend(comp);
            //if constructor, call it
            if (comp && "init" in comp) {
                comp.init.call(this);
            }
        }

        this.trigger("NewComponent", uninit);
        return this;
    },

    /**@
     * #.toggleComponent
     * @comp Crafty Core
     * @sign public this .toggleComponent(String ComponentList)
     * @param ComponentList - A string of components to add or remove separated by a comma `,`
     * @sign public this .toggleComponent(String Component1[, .., String componentN])
     * @param Component# - Component ID to add or remove.
     * Add or Remove Components from an entity.
     *
     * @example
     * ~~~
     * var e = Crafty.e("2D,DOM,Test");
     * e.toggleComponent("Test,Test2"); //Remove Test, add Test2
     * e.toggleComponent("Test,Test2"); //Add Test, remove Test2
     * ~~~
     *
     * ~~~
     * var e = Crafty.e("2D,DOM,Test");
     * e.toggleComponent("Test","Test2"); //Remove Test, add Test2
     * e.toggleComponent("Test","Test2"); //Add Test, remove Test2
     * e.toggleComponent("Test");         //Remove Test
     * ~~~
     */
    toggleComponent: function (toggle) {
        var i = 0,
            l, comps;
        if (arguments.length > 1) {
            l = arguments.length;

            for (; i < l; i++) {
                if (this.has(arguments[i])) {
                    this.removeComponent(arguments[i]);
                } else {
                    this.addComponent(arguments[i]);
                }
            }
            //split components if contains comma
        } else if (toggle.indexOf(',') !== -1) {
            comps = toggle.split(rlist);
            l = comps.length;
            for (; i < l; i++) {
                if (this.has(comps[i])) {
                    this.removeComponent(comps[i]);
                } else {
                    this.addComponent(comps[i]);
                }
            }

            //single component passed
        } else {
            if (this.has(toggle)) {
                this.removeComponent(toggle);
            } else {
                this.addComponent(toggle);
            }
        }

        return this;
    },

    /**@
     * #.requires
     * @comp Crafty Core
     * @sign public this .requires(String componentList)
     * @param componentList - List of components that must be added
     *
     * Makes sure the entity has the components listed. If the entity does not
     * have the component, it will add it.
     *
     * (In the current version of Crafty, this function behaves exactly the same
     * as `addComponent`. By convention, developers have used `requires` for
     * component dependencies -- i.e. to indicate specifically that one component
     * will only work properly if another component is present -- and used
     * `addComponent` in all other situations.)
     *
     * @see .addComponent
     */
    requires: function (list) {
        return this.addComponent(list);
    },

    /**@
     * #.removeComponent
     * @comp Crafty Core
     * @sign public this .removeComponent(String Component[, soft])
     * @param component - Component to remove
     * @param soft - Whether to soft remove it (defaults to `true`)
     *
     * Removes a component from an entity. A soft remove (the default) will only
     * refrain `.has()` from returning true. Hard will remove all
     * associated properties and methods.
     *
     * @example
     * ~~~
     * var e = Crafty.e("2D,DOM,Test");
     * e.removeComponent("Test");        //Soft remove Test component
     * e.removeComponent("Test", false); //Hard remove Test component
     * ~~~
     */
    removeComponent: function (id, soft) {
        var comp = components[id];
        this.trigger("RemoveComponent", id);
        if (comp && "remove" in comp) {
            comp.remove.call(this, false);
        }
        if (soft === false && comp) {
            for (var prop in comp) {
                delete this[prop];
            }
        }
        delete this.__c[id];


        return this;
    },

    /**@
     * #.getId
     * @comp Crafty Core
     * @sign public Number .getId(void)
     * Returns the ID of this entity.
     *
     * For better performance, simply use the this[0] property.
     *
     * @example
     * Finding out the `ID` of an entity can be done by returning the property `0`.
     * ~~~
     *    var ent = Crafty.e("2D");
     *    ent[0]; //ID
     *    ent.getId(); //also ID
     * ~~~
     */
    getId: function () {
        return this[0];
    },

    /**@
     * #.has
     * @comp Crafty Core
     * @sign public Boolean .has(String component)
     * Returns `true` or `false` depending on if the
     * entity has the given component.
     *
     * For better performance, simply use the `.__c` object
     * which will be `true` if the entity has the component or
     * will not exist (or be `false`).
     */
    has: function (id) {
        return !!this.__c[id];
    },

    /**@
     * #.attr
     * @comp Crafty Core
     * @sign public this .attr(String property, * value)
     * @param property - Property of the entity to modify
     * @param value - Value to set the property to
     * @sign public this .attr(Object map)
     * @param map - Object where the key is the property to modify and the value as the property value
     * @trigger Change - when properties change - {key: value}
     *
     * Use this method to set any property of the entity.
     *
     * @example
     * ~~~
     * this.attr({key: "value", prop: 5});
     * this.key; //value
     * this.prop; //5
     *
     * this.attr("key", "newvalue");
     * this.key; //newvalue
     * ~~~
     */
    attr: function (key, value) {
        if (arguments.length === 1) {
            //if just the key, return the value
            if (typeof key === "string") {
                return this[key];
            }

            //extend if object
            this.extend(key);
            this.trigger("Change", key); //trigger change event
            return this;
        }
        //if key value pair
        this[key] = value;

        var change = {};
        change[key] = value;
        this.trigger("Change", change); //trigger change event
        return this;
    },

    /**@
     * #.toArray
     * @comp Crafty Core
     * @sign public this .toArray(void)
     *
     * This method will simply return the found entities as an array of ids.  To get an array of the actual entities, use `get()`.
     * @see .get
     */
    toArray: function () {
        return slice.call(this, 0);
    },

    /**@
    * #.timeout
    * @comp Crafty Core
    * @sign public this .timeout(Function callback, Number delay)
    * @param callback - Method to execute after given amount of milliseconds
    * @param delay - Amount of milliseconds to execute the method
    *
    * The delay method will execute a function after a given amount of time in milliseconds.
    *
    * Essentially a wrapper for `setTimeout`.
    *
    * @example
    * Destroy itself after 100 milliseconds
    * ~~~
    * this.timeout(function() {
         this.destroy();
    * }, 100);
    * ~~~
    */
    timeout: function (callback, duration) {
        this.each(function () {
            var self = this;
            setTimeout(function () {
                callback.call(self);
            }, duration);
        });
        return this;
    },

    /**@
     * #.bind
     * @comp Crafty Core
     * @sign public this .bind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute when the event is triggered
     * Attach the current entity (or entities) to listen for an event.
     *
     * Callback will be invoked when an event with the event name passed
     * is triggered. Depending on the event, some data may be passed
     * via an argument to the callback function.
     *
     * The first argument is the event name (can be anything) whilst the
     * second argument is the callback. If the event has data, the
     * callback should have an argument.
     *
     * Events are arbitrary and provide communication between components.
     * You can trigger or bind an event even if it doesn't exist yet.
     *
     * Unlike DOM events, Crafty events are exectued synchronously.
     *
     * @example
     * ~~~
     * this.attr("triggers", 0); //set a trigger count
     * this.bind("myevent", function() {
     *     this.triggers++; //whenever myevent is triggered, increment
     * });
     * this.bind("EnterFrame", function() {
     *     this.trigger("myevent"); //trigger myevent on every frame
     * });
     * ~~~
     *
     * @see .trigger, .unbind
     */
    bind: function (event, callback) {

        // (To learn how the handlers object works, see inline comment at Crafty.bind)

        //optimization for 1 entity
        if (this.length === 1) {
            if (!handlers[event]) handlers[event] = {};
            var h = handlers[event];

            if (!h[this[0]]) h[this[0]] = []; //init handler array for entity
            h[this[0]].push(callback); //add current callback
            return this;
        }

        this.each(function () {
            //init event collection
            if (!handlers[event]) handlers[event] = {};
            var h = handlers[event];

            if (!h[this[0]]) h[this[0]] = []; //init handler array for entity
            h[this[0]].push(callback); //add current callback
        });
        return this;
    },

    /**@
     * #.uniqueBind
     * @comp Crafty Core
     * @sign public Number .uniqueBind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns ID of the current callback used to unbind
     *
     * Works like Crafty.bind, but prevents a callback from being bound multiple times.
     *
     * @see .bind
     */
    uniqueBind: function (event, callback) {
        this.unbind(event, callback);
        this.bind(event, callback);

    },

    /**@
     * #.one
     * @comp Crafty Core
     * @sign public Number one(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns ID of the current callback used to unbind
     *
     * Works like Crafty.bind, but will be unbound once the event triggers.
     *
     * @see .bind
     */
    one: function (event, callback) {
        var self = this;
        var oneHandler = function (data) {
            callback.call(self, data);
            self.unbind(event, oneHandler);
        };
        return self.bind(event, oneHandler);

    },

    /**@
     * #.unbind
     * @comp Crafty Core
     * @sign public this .unbind(String eventName[, Function callback])
     * @param eventName - Name of the event to unbind
     * @param callback - Function to unbind
     * Removes binding with an event from current entity.
     *
     * Passing an event name will remove all events bound to
     * that event. Passing a reference to the callback will
     * unbind only that callback.
     * @see .bind, .trigger
     */
    unbind: function (event, callback) {
        // (To learn how the handlers object works, see inline comment at Crafty.bind)
        this.each(function () {
            var hdl = handlers[event],
                i = 0,
                l, current;
            //if no events, cancel
            if (hdl && hdl[this[0]]) l = hdl[this[0]].length;
            else return this;

            //if no function, delete all
            if (!callback) {
                delete hdl[this[0]];
                return this;
            }
            //look for a match if the function is passed
            for (; i < l; i++) {
                current = hdl[this[0]];
                if (current[i] == callback) {
                    delete current[i];
                }
            }
        });

        return this;
    },

    /**@
     * #.trigger
     * @comp Crafty Core
     * @sign public this .trigger(String eventName[, Object data])
     * @param eventName - Event to trigger
     * @param data - Arbitrary data that will be passed into every callback as an argument
     * Trigger an event with arbitrary data. Will invoke all callbacks with
     * the context (value of `this`) of the current entity object.
     *
     * *Note: This will only execute callbacks within the current entity, no other entity.*
     *
     * The first argument is the event name to trigger and the optional
     * second argument is the arbitrary event data. This can be absolutely anything.
     *
     * Unlike DOM events, Crafty events are exectued synchronously.
     */
    trigger: function (event, data) {
        // (To learn how the handlers object works, see inline comment at Crafty.bind)
        if (this.length === 1) {
            //find the handlers assigned to the event and entity
            if (handlers[event] && handlers[event][this[0]]) {
                var callbacks = handlers[event][this[0]],
                    i;
                for (i = 0; i < callbacks.length; i++) {
                    if (typeof callbacks[i] === "undefined") {
                        callbacks.splice(i, 1);
                        i--;
                    } else {
                        callbacks[i].call(this, data);
                    }
                }
            }
            return this;
        }

        this.each(function () {
            //find the handlers assigned to the event and entity
            if (handlers[event] && handlers[event][this[0]]) {
                var callbacks = handlers[event][this[0]],
                    i;
                for (i = 0; i < callbacks.length; i++) {
                    if (typeof callbacks[i] === "undefined") {
                        callbacks.splice(i, 1);
                        i--;
                    } else {
                        callbacks[i].call(this, data);
                    }
                }
            }
        });
        return this;
    },

    /**@
     * #.each
     * @comp Crafty Core
     * @sign public this .each(Function method)
     * @param method - Method to call on each iteration
     * Iterates over found entities, calling a function for every entity.
     *
     * The function will be called for every entity and will pass the index
     * in the iteration as an argument. The context (value of `this`) of the
     * function will be the current entity in the iteration.
     *
     * @example
     * Destroy every second 2D entity
     * ~~~
     * Crafty("2D").each(function(i) {
     *     if(i % 2 === 0) {
     *         this.destroy();
     *     }
     * });
     * ~~~
     */
    each: function (func) {
        var i = 0,
            l = this.length;
        for (; i < l; i++) {
            //skip if not exists
            if (!entities[this[i]]) continue;
            func.call(entities[this[i]], i);
        }
        return this;
    },

    /**@
     * #.get
     * @comp Crafty Core
     * @sign public Array .get()
     * @returns An array of entities corresponding to the active selector
     * 
     * @sign public Entity .get(Number index)
     * @returns an entity belonging to the current selection
     * @param index - The index of the entity to return.  If negative, counts back from the end of the array.
     * 
     *
     * @example
     * Get an array containing every "2D" entity
     * ~~~
     * var arr = Crafty("2D").get()
     * ~~~
     * Get the first entity matching the selector
     * ~~~
     * // equivalent to Crafty("2D").get()[0], but doesn't create a new array
     * var e = Crafty("2D").get(0)
     * ~~~
     * Get the last "2D" entity matching the selector
     * ~~~
     * var e = Crafty("2D").get(-1)
     * ~~~
     * 
     */
    get: function(index) {
        var l = this.length;
        if (typeof index !== "undefined") {
            if (index >= l || index+l < 0)
                return undefined;
            if (index>=0)
                return entities[this[index]];
            else
                return entities[this[index+l]];
        } else {
            var i=0, result = [];
            for (; i < l; i++) {
                //skip if not exists
                if (!entities[this[i]]) continue;
                result.push( entities[this[i]] );
            }
            return result;
        }
    },

    /**@
     * #.clone
     * @comp Crafty Core
     * @sign public Entity .clone(void)
     * @returns Cloned entity of the current entity
     *
     * Method will create another entity with the exact same
     * properties, components and methods as the current entity.
     */
    clone: function () {
        var comps = this.__c,
            comp,
            prop,
            clone = Crafty.e();

        for (comp in comps) {
            clone.addComponent(comp);
        }
        for (prop in this) {
            if (prop != "0" && prop != "_global" && prop != "_changed" && typeof this[prop] != "function" && typeof this[prop] != "object") {
                clone[prop] = this[prop];
            }
        }

        return clone;
    },

    /**@
     * #.setter
     * @comp Crafty Core
     * @sign public this .setter(String property, Function callback)
     * @param property - Property to watch for modification
     * @param callback - Method to execute if the property is modified
     * Will watch a property waiting for modification and will then invoke the
     * given callback when attempting to modify.
     *
     */
    setter: function (prop, callback) {
        if (Crafty.support.setter) {
            this.__defineSetter__(prop, callback);
        } else if (Crafty.support.defineProperty) {
            Object.defineProperty(this, prop, {
                set: callback,
                configurable: true
            });
        }
        return this;
    },

    /**@
     * #.destroy
     * @comp Crafty Core
     * @sign public this .destroy(void)
     * Will remove all event listeners and delete all properties as well as removing from the stage
     */
    destroy: function () {
        //remove all event handlers, delete from entities
        this.each(function () {
            var comp;
            this.trigger("Remove");
            for (var compName in this.__c) {
                comp = components[compName];
                if (comp && "remove" in comp)
                    comp.remove.call(this, true);
            }
            for (var e in handlers) {
                this.unbind(e);
            }
            delete entities[this[0]];
        });
    }
};

//give the init instances the Crafty prototype
Crafty.fn.init.prototype = Crafty.fn;


/**@
 * #Crafty.extend
 * @category Core
 * Used to extend the Crafty namespace.
 *
 */
Crafty.extend = Crafty.fn.extend = function (obj) {
    var target = this,
        key;

    //don't bother with nulls
    if (!obj) return target;

    for (key in obj) {
        if (target === obj[key]) continue; //handle circular reference
        target[key] = obj[key];
    }

    return target;
};


Crafty.extend({
    /**@
     * #Crafty.init
     * @category Core
     * @trigger Load - Just after the viewport is initialised. Before the EnterFrame loops is started
     * @sign public this Crafty.init([Number width, Number height, String stage_elem])
     * @sign public this Crafty.init([Number width, Number height, HTMLElement stage_elem])
     * @param Number width - Width of the stage
     * @param Number height - Height of the stage
     * @param String or HTMLElement stage_elem - the element to use for the stage
     *
     * Sets the element to use as the stage, creating it if necessary.  By default a div with id 'cr-stage' is used, but if the 'stage_elem' argument is provided that will be used instead.  (see `Crafty.viewport.init`)
     *
     * Starts the `EnterFrame` interval. This will call the `EnterFrame` event for every frame.
     *
     * Can pass width and height values for the stage otherwise will default to window size (see `Crafty.DOM.window`).
     *
     * All `Load` events will be executed.
     *
     * Uses `requestAnimationFrame` to sync the drawing with the browser but will default to `setInterval` if the browser does not support it.
     * @see Crafty.stop,  Crafty.viewport
     */
    init: function (w, h) {
        Crafty.viewport.init(w, h);

        //call all arbitrary functions attached to onload
        this.trigger("Load");
        this.timer.init();

        return this;
    },

    /**@
     * #Crafty.getVersion
     * @category Core
     * @sign public String Crafty.getVersion()
     * @returns Current version of Crafty as a string
     *
     * Return current version of crafty
     *
     * @example
     * ~~~
     * Crafty.getVersion(); //'0.5.2'
     * ~~~
     */
    getVersion: function () {
        return version;
    },

    /**@
     * #Crafty.stop
     * @category Core
     * @trigger CraftyStop - when the game is stopped
     * @sign public this Crafty.stop([bool clearState])
     * @param clearState - if true the stage and all game state is cleared.
     *
     * Stops the EnterFrame interval and removes the stage element.
     *
     * To restart, use `Crafty.init()`.
     * @see Crafty.init
     */
    stop: function (clearState) {
        this.timer.stop(); 

        Crafty.trigger("CraftyStop");

        return this;
    },

    /**@
     * #Crafty.pause
     * @category Core
     * @trigger Pause - when the game is paused
     * @trigger Unpause - when the game is unpaused
     * @sign public this Crafty.pause(void)
     *
     * Pauses the game by stopping the EnterFrame event from firing. If the game is already paused it is unpaused.
     * You can pass a boolean parameter if you want to pause or unpause mo matter what the current state is.
     * Modern browsers pauses the game when the page is not visible to the user. If you want the Pause event
     * to be triggered when that happens you can enable autoPause in `Crafty.settings`.
     *
     * @example
     * Have an entity pause the game when it is clicked.
     * ~~~
     * button.bind("click", function() {
     *     Crafty.pause();
     * });
     * ~~~
     */
    pause: function (toggle) {
        if (arguments.length === 1 ? toggle : !this._paused) {
            this.trigger('Pause');
            this._paused = true;
            setTimeout(function () {
                Crafty.timer.stop();
            }, 0);
            Crafty.keydown = {};
        } else {
            this.trigger('Unpause');
            this._paused = false;
            setTimeout(function () {
                Crafty.timer.init();
            }, 0);
        }
        return this;
    },

    /**@
     * #Crafty.isPaused
     * @category Core
     * @sign public this Crafty.isPaused()
     *
     * Check whether the game is already paused or not.
     *
     * @example
     * ~~~
     * Crafty.isPaused();
     * ~~~
     */
    isPaused: function () {
        return this._paused;
    },

    /**@
     * #Crafty.timer
     * @category Game Loop
     * Handles game ticks
     */
    timer: (function () {
        /*
         * `window.requestAnimationFrame` or its variants is called for animation.
         * `.requestID` keeps a record of the return value previous `window.requestAnimationFrame` call.
         * This is an internal variable. Used to stop frame.
         */
        var tick, requestID;

        // Internal variables used to control the game loop.  Use Crafty.timer.steptype() to set these.
        var mode = "fixed",
            maxFramesPerStep = 5,
            maxTimestep = 40;

        // variables used by the game loop to track state
        var endTime = 0,
            timeSlip = 0,
            gameTime;

        // Controls the target rate of fixed mode loop.  Set these with the Crafty.timer.FPS function
        var FPS = 50,
            milliSecPerFrame = 1000 / FPS;




        return {
            init: function () {
                // When first called, set the  gametime one frame before now!
                if (typeof gameTime === "undefined")
                    gameTime = (new Date().getTime()) - milliSecPerFrame;
                var onFrame = window.requestAnimationFrame ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame ||
                    window.oRequestAnimationFrame ||
                    window.msRequestAnimationFrame ||
                    null;

                if (onFrame) {
                    tick = function () {
                        Crafty.timer.step();
                        requestID = onFrame(tick);
                        //console.log(requestID + ', ' + frame)
                    };

                    tick();
                } else {
                    tick = setInterval(function () {
                        Crafty.timer.step();
                    }, 1000 / FPS);
                }
            },

            stop: function () {
                Crafty.trigger("CraftyStopTimer");

                if (typeof tick === "number") clearInterval(tick);

                var onFrame = window.cancelRequestAnimationFrame ||
                    window.webkitCancelRequestAnimationFrame ||
                    window.mozCancelRequestAnimationFrame ||
                    window.oCancelRequestAnimationFrame ||
                    window.msCancelRequestAnimationFrame ||
                    null;

                if (onFrame) onFrame(requestID);
                tick = null;
            },


            /**@
             * #Crafty.timer.steptype
             * @comp Crafty.timer
             * @sign public void Crafty.timer.steptype(mode [, maxTimeStep])
             * Can be called to set the type of timestep the game loop uses
             * @param mode - the type of time loop.  Allowed values are "fixed", "semifixed", and "variable".  Crafty defaults to "fixed".
             * @param mode - For "fixed", sets the max number of frames per step.   For "variable" and "semifixed", sets the maximum time step allowed.
             *
             * * In "fixed" mode, each frame is sent the same value of `dt`, and to achieve the target game speed, mulitiple frame events are triggered before each render.
             * * In "variable" mode, there is only one frame triggered per render.  This recieves a value of `dt` equal to the actual elapsed time since the last frame.
             * * In "semifixed" mode, multiple frames per render are processed, and the total time since the last frame is divided evenly between them.
             *
             */

            steptype: function (newmode, option) {
                if (newmode === "variable" || newmode === "semifixed") {
                    mode = newmode;
                    if (option)
                        maxTimestep = option;

                } else if (newmode === "fixed") {
                    mode = "fixed";
                    if (option)
                        maxFramesPerStep = option;
                } else {
                    throw "Invalid step type specified";
                }


            },

            /**@
             * #Crafty.timer.step
             * @comp Crafty.timer
             * @sign public void Crafty.timer.step()
             * @trigger EnterFrame - Triggered on each frame.  Passes the frame number, and the amount of time since the last frame.  If the time is greater than maxTimestep, that will be used instead.  (The default value of maxTimestep is 50 ms.) - { frame: Number, dt:Number }
             * @trigger RenderScene - Triggered every time a scene should be rendered
             * @trigger MeasureWaitTime - Triggered at the beginning of each step after the first.  Passes the time the game loop waited between steps. - Number
             * @trigger MeasureFrameTime - Triggered after each step.  Passes the time it took to advance one frame. - Number
             * @trigger MeasureRenderTime - Triggered after each render. Passes the time it took to render the scene - Number
             * Advances the game by triggering `EnterFrame` and `RenderScene`
             */
            step: function () {
                var drawTimeStart, dt, lastFrameTime, loops = 0;

                currentTime = new Date().getTime();
                if (endTime > 0)
                    Crafty.trigger("MeasureWaitTime", currentTime - endTime);

                // If we're currently ahead of the current time, we need to wait until we're not!
                if (gameTime + timeSlip >= currentTime) {
                    endTime = currentTime;
                    return;
                }

                var netTimeStep = currentTime - (gameTime + timeSlip);
                // We try to keep up with the target FPS by processing multiple frames per render
                // If we're hopelessly behind, stop trying to catch up.
                if (netTimeStep > milliSecPerFrame * 20) {
                    //gameTime = currentTime - milliSecPerFrame;
                    timeSlip += netTimeStep - milliSecPerFrame;
                    netTimeStep = milliSecPerFrame;
                }

                // Set up how time is incremented
                if (mode === "fixed") {
                    loops = Math.ceil(netTimeStep / milliSecPerFrame);
                    // maxFramesPerStep adjusts how willing we are to delay drawing in order to keep at the target FPS
                    loops = Math.min(loops, maxFramesPerStep);
                    dt = milliSecPerFrame;
                } else if (mode === "variable") {
                    loops = 1;
                    dt = netTimeStep;
                    // maxTimestep is the maximum time to be processed in a frame.  (Large dt => unstable physics)
                    dt = Math.min(dt, maxTimestep);
                } else if (mode === "semifixed") {
                    loops = Math.ceil(netTimeStep / maxTimestep);
                    dt = netTimeStep / loops;
                }

                // Process frames, incrementing the game clock with each frame.
                // dt is determined by the mode
                for (var i = 0; i < loops; i++) {
                    lastFrameTime = currentTime;
                    // Everything that changes over time hooks into this event
                    Crafty.trigger("EnterFrame", {
                        frame: frame++,
                        dt: dt,
                        gameTime: gameTime
                    });
                    gameTime += dt;
                    currentTime = new Date().getTime();
                    Crafty.trigger("MeasureFrameTime", currentTime - lastFrameTime);
                }

                //If any frames were processed, render the results
                if (loops > 0) {
                    drawTimeStart = currentTime;
                    Crafty.trigger("RenderScene");
                    // Post-render cleanup opportunity
                    Crafty.trigger("PostRender");
                    currentTime = new Date().getTime();
                    Crafty.trigger("MeasureRenderTime", currentTime - drawTimeStart);
                }

                endTime = currentTime;
            },
            /**@
             * #Crafty.timer.FPS
             * @comp Crafty.timer
             * @sign public void Crafty.timer.FPS()
             * Returns the target frames per second. This is not an actual frame rate.
             * @sign public void Crafty.timer.FPS(Number value)
             * @param value - the target rate
             * Sets the target frames per second. This is not an actual frame rate.
             * The default rate is 50.
             */
            FPS: function (value) {
                if (typeof value == "undefined")
                    return FPS;
                else {
                    FPS = value;
                    milliSecPerFrame = 1000 / FPS;
                }
            },

            /**@
             * #Crafty.timer.simulateFrames
             * @comp Crafty.timer
             * @sign public this Crafty.timer.simulateFrames(Number frames[, Number timestep])
             * Advances the game state by a number of frames and draws the resulting stage at the end. Useful for tests and debugging.
             * @param frames - number of frames to simulate
             * @param timestep - the duration to pass each frame.  Defaults to milliSecPerFrame (20 ms) if not specified.
             */
            simulateFrames: function (frames, timestep) {
                if (typeof timestep === "undefined")
                    timestep = milliSecPerFrame;
                while (frames-- > 0) {
                    Crafty.trigger("EnterFrame", {
                        frame: frame++,
                        dt: timestep
                    });
                }
                Crafty.trigger("RenderScene");
            }
        };
    })(),


    /**@
     * #Crafty.e
     * @category Core
     * @trigger NewEntity - When the entity is created and all components are added - { id:Number }
     * @sign public Entity Crafty.e(String componentList)
     * @param componentList - List of components to assign to new entity
     * @sign public Entity Crafty.e(String component1[, .., String componentN])
     * @param component# - Component to add
     *
     * Creates an entity. Any arguments will be applied in the same
     * way `.addComponent()` is applied as a quick way to add components.
     *
     * Any component added will augment the functionality of
     * the created entity by assigning the properties and methods from the component to the entity.
     *
     * @example
     * ~~~
     * var myEntity = Crafty.e("2D, DOM, Color");
     * ~~~
     *
     * @see Crafty.c
     */
    e: function () {
        var id = UID(),
            craft;

        entities[id] = null; //register the space
        entities[id] = craft = Crafty(id);

        if (arguments.length > 0) {
            craft.addComponent.apply(craft, arguments);
        }
        craft.setName('Entity #' + id); //set default entity human readable name
        craft.addComponent("obj"); //every entity automatically assumes obj

        Crafty.trigger("NewEntity", {
            id: id
        });

        return craft;
    },

    /**@
     * #Crafty.c
     * @category Core
     * @sign public void Crafty.c(String name, Object component)
     * @param name - Name of the component
     * @param component - Object with the component's properties and methods
     * Creates a component where the first argument is the ID and the second
     * is the object that will be inherited by entities.
     *
     * A couple of methods are treated specially. They are invoked in partiular contexts, and (in those contexts) cannot be overridden by other components.
     *
     * - `init` will be called when the component is added to an entity
     * - `remove` will be called just before a component is removed, or before an entity is destroyed. It is passed a single boolean parameter that is `true` if the entity is being destroyed.
     *
     * In addition to these hardcoded special methods, there are some conventions for writing components.
     *
     * - Properties or methods that start with an underscore are considered private.
     * - A method with the same name as the component is considered to be a constructor
     * and is generally used when you need to pass configuration data to the component on a per entity basis.
     *
     * @example
     * ~~~
     * Crafty.c("Annoying", {
     *     _message: "HiHi",
     *     init: function() {
     *         this.bind("EnterFrame", function() { alert(this.message); });
     *     },
     *     annoying: function(message) { this.message = message; }
     * });
     *
     * Crafty.e("Annoying").annoying("I'm an orange...");
     * ~~~
     *
     *
     * WARNING:
     *
     * in the example above the field _message is local to the entity. That is, if you create many entities with the Annoying component they can all have different values for _message. That is because it is a simple value, and simple values are copied by value. If however the field had been an object or array, the value would have been shared by all entities with the component because complex types are copied by reference in javascript. This is probably not what you want and the following example demonstrates how to work around it:
     *
     * ~~~
     * Crafty.c("MyComponent", {
     *     _iAmShared: { a: 3, b: 4 },
     *     init: function() {
     *         this._iAmNotShared = { a: 3, b: 4 };
     *     },
     * });
     * ~~~
     *
     * @see Crafty.e
     */
    c: function (compName, component) {
        components[compName] = component;
    },

    /**@
     * #Crafty.trigger
     * @category Core, Events
     * @sign public void Crafty.trigger(String eventName, * data)
     * @param eventName - Name of the event to trigger
     * @param data - Arbitrary data to pass into the callback as an argument
     *
     * This method will trigger every single callback attached to the event name. This means
     * every global event and every entity that has a callback.
     *
     * @see Crafty.bind
     */
    trigger: function (event, data) {

        // (To learn how the handlers object works, see inline comment at Crafty.bind)
        var hdl = handlers[event],
            h, i, l, callbacks, context;
        //loop over every object bound
        for (h in hdl) {

            // Check whether h needs to be processed
            if (!hdl.hasOwnProperty(h)) continue;
            callbacks = hdl[h];
            if (!callbacks || callbacks.length === 0) continue;

            //if an entity, call with that context; else the global context
            if (entities[h])
                context = Crafty(+h);
            else
                context = Crafty;

            //loop over every handler within object
            for (i = 0; i < callbacks.length; i++) {
                // Remove a callback if it has been deleted
                if (typeof callbacks[i] === "undefined") {
                    callbacks.splice(i, 1);
                    i--;
                } else
                    callbacks[i].call(context, data);
            }
        }
    },

    /**@
     * #Crafty.bind
     * @category Core, Events
     * @sign public Number bind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Binds to a global event. Method will be executed when `Crafty.trigger` is used
     * with the event name.
     *
     * @see Crafty.trigger, Crafty.unbind
     */
    bind: function (event, callback) {

        // Background: The structure of the global object "handlers"
        // ---------------------------------------------------------
        // Here is an example of what "handlers" can look like:
        // handlers ===
        //    { Move:  {5:[fnA], 6:[fnB, fnC], global:[fnD]},
        //     Change: {6:[fnE]}
        //    }
        // In this example, when the 'Move' event is triggered on entity #6 (e.g.
        // entity6.trigger('Move')), it causes the execution of fnB() and fnC(). When
        // the Move event is triggered globally (i.e. Crafty.trigger('Move')), it
        // will execute fnA, fnB, fnC, fnD.
        //
        // In this example, "this" is bound to entity #6 whenever fnB() is executed, and
        // "this" is bound to Crafty whenever fnD() is executed.
        //
        // In other words, the structure of "handlers" is:
        //
        // handlers[event][entityID or 'global'] === (Array of callback functions)

        if (!handlers[event]) handlers[event] = {};
        var hdl = handlers[event];

        if (!hdl.global) hdl.global = [];
        hdl.global.push(callback);
        return callback;
    },


    /**@
     * #Crafty.uniqueBind
     * @category Core, Events
     * @sign public Number uniqueBind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Works like Crafty.bind, but prevents a callback from being bound multiple times.
     *
     * @see Crafty.bind
     */
    uniqueBind: function (event, callback) {
        this.unbind(event, callback);
        return this.bind(event, callback);
    },

    /**@
     * #Crafty.one
     * @category Core, Events
     * @sign public Number one(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Works like Crafty.bind, but will be unbound once the event triggers.
     *
     * @see Crafty.bind
     */
    one: function (event, callback) {
        var self = this;
        var oneHandler = function (data) {
            callback.call(self, data);
            self.unbind(event, oneHandler);
        };
        return self.bind(event, oneHandler);
    },

    /**@
     * #Crafty.unbind
     * @category Core, Events
     * @sign public Boolean Crafty.unbind(String eventName, Function callback)
     * @param eventName - Name of the event to unbind
     * @param callback - Function to unbind
     * @sign public Boolean Crafty.unbind(String eventName, Number callbackID)
     * @param callbackID - ID of the callback
     * @returns True or false depending on if a callback was unbound
     * Unbind any event from any entity or global event.
     * @example
     * ~~~
     *    var play_gameover_sound = function () {...};
     *    Crafty.bind('GameOver', play_gameover_sound);
     *    ...
     *    Crafty.unbind('GameOver', play_gameover_sound);
     * ~~~
     *
     * The first line defines a callback function. The second line binds that
     * function so that `Crafty.trigger('GameOver')` causes that function to
     * run. The third line unbinds that function.
     *
     * ~~~
     *    Crafty.unbind('GameOver');
     * ~~~
     *
     * This unbinds ALL global callbacks for the event 'GameOver'. That
     * includes all callbacks attached by `Crafty.bind('GameOver', ...)`, but
     * none of the callbacks attached by `some_entity.bind('GameOver', ...)`.
     */
    unbind: function (event, callback) {
        // (To learn how the handlers object works, see inline comment at Crafty.bind)
        var hdl = handlers[event],
            i, l, global_callbacks, found_match;

        if (hdl === undefined || hdl.global === undefined || hdl.global.length === 0) {
            return false;
        }

        // If no callback was supplied, delete everything
        if (arguments.length === 1) {
            delete hdl.global;
            return true;
        }

        // loop over the globally-attached events
        global_callbacks = hdl.global;
        found_match = false;
        for (i = 0, l = global_callbacks.length; i < l; i++) {
            if (global_callbacks[i] === callback) {
                found_match = true;
                delete global_callbacks[i];
            }
        }
        return found_match;
    },

    /**@
     * #Crafty.frame
     * @category Core
     * @sign public Number Crafty.frame(void)
     * Returns the current frame number
     */
    frame: function () {
        return frame;
    },

    components: function () {
        return components;
    },

    isComp: function (comp) {
        return comp in components;
    },

    debug: function (str) {
        // access internal variables - handlers or entities
        if (str === 'handlers') {
            return handlers;
        }
        return entities;
    },

    /**@
     * #Crafty.settings
     * @category Core
     * Modify the inner workings of Crafty through the settings.
     */
    settings: (function () {
        var states = {},
            callbacks = {};

        return {
            /**@
             * #Crafty.settings.register
             * @comp Crafty.settings
             * @sign public void Crafty.settings.register(String settingName, Function callback)
             * @param settingName - Name of the setting
             * @param callback - Function to execute when use modifies setting
             *
             * Use this to register custom settings. Callback will be executed when `Crafty.settings.modify` is used.
             *
             * @see Crafty.settings.modify
             */
            register: function (setting, callback) {
                callbacks[setting] = callback;
            },

            /**@
             * #Crafty.settings.modify
             * @comp Crafty.settings
             * @sign public void Crafty.settings.modify(String settingName, * value)
             * @param settingName - Name of the setting
             * @param value - Value to set the setting to
             *
             * Modify settings through this method.
             *
             * @see Crafty.settings.register, Crafty.settings.get
             */
            modify: function (setting, value) {
                if (!callbacks[setting]) return;
                callbacks[setting].call(states[setting], value);
                states[setting] = value;
            },

            /**@
             * #Crafty.settings.get
             * @comp Crafty.settings
             * @sign public * Crafty.settings.get(String settingName)
             * @param settingName - Name of the setting
             * @returns Current value of the setting
             *
             * Returns the current value of the setting.
             *
             * @see Crafty.settings.register, Crafty.settings.get
             */
            get: function (setting) {
                return states[setting];
            }
        };
    })(),

    clone: clone
});

/**
 * Return a unique ID
 */

function UID() {
    var id = GUID++;
    //if GUID is not unique
    if (id in entities) {
        return UID(); //recurse until it is unique
    }
    return id;
}

/**@
 * #Crafty.clone
 * @category Core
 * @sign public Object .clone(Object obj)
 * @param obj - an object
 *
 * Deep copy (a.k.a clone) of an object.
 */

function clone(obj) {
    if (obj === null || typeof (obj) != 'object')
        return obj;

    var temp = obj.constructor(); // changed

    for (var key in obj)
        temp[key] = clone(obj[key]);
    return temp;
}

// export Crafty
if (typeof define === 'function') { // AMD
    define('crafty', [], function () {
        return Crafty;
    });
} else if (typeof exports === 'object') { // CommonJS
    module.exports = Crafty;
}

window.Crafty = Crafty;


},{"./version":24}],8:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.device
     * @category Misc
     */
    device: {
        _deviceOrientationCallback: false,
        _deviceMotionCallback: false,

        /**
         * The HTML5 DeviceOrientation event returns three pieces of data:
         *  * alpha the direction the device is facing according to the compass
         *  * beta the angle in degrees the device is tilted front-to-back
         *  * gamma the angle in degrees the device is tilted left-to-right.
         *  * The angles values increase as you tilt the device to the right or towards you.
         *
         * Since Firefox uses the MozOrientationEvent which returns similar data but
         * using different parameters and a different measurement system, we want to
         * normalize that before we pass it to our _deviceOrientationCallback function.
         *
         * @param eventData HTML5 DeviceOrientation event
         */
        _normalizeDeviceOrientation: function (eventData) {
            var data;
            if (window.DeviceOrientationEvent) {
                data = {
                    // gamma is the left-to-right tilt in degrees, where right is positive
                    'tiltLR': eventData.gamma,
                    // beta is the front-to-back tilt in degrees, where front is positive
                    'tiltFB': eventData.beta,
                    // alpha is the compass direction the device is facing in degrees
                    'dir': eventData.alpha,
                    // deviceorientation does not provide this data
                    'motUD': null
                };
            } else if (window.OrientationEvent) {
                data = {
                    // x is the left-to-right tilt from -1 to +1, so we need to convert to degrees
                    'tiltLR': eventData.x * 90,
                    // y is the front-to-back tilt from -1 to +1, so we need to convert to degrees
                    // We also need to invert the value so tilting the device towards us (forward)
                    // results in a positive value.
                    'tiltFB': eventData.y * -90,
                    // MozOrientation does not provide this data
                    'dir': null,
                    // z is the vertical acceleration of the device
                    'motUD': eventData.z
                };
            }

            Crafty.device._deviceOrientationCallback(data);
        },

        /**
         * @param eventData HTML5 DeviceMotion event
         */
        _normalizeDeviceMotion: function (eventData) {
            var acceleration = eventData.accelerationIncludingGravity,
                facingUp = (acceleration.z > 0) ? +1 : -1;

            var data = {
                // Grab the acceleration including gravity from the results
                'acceleration': acceleration,
                'rawAcceleration': "[" + Math.round(acceleration.x) + ", " + Math.round(acceleration.y) + ", " + Math.round(acceleration.z) + "]",
                // Z is the acceleration in the Z axis, and if the device is facing up or down
                'facingUp': facingUp,
                // Convert the value from acceleration to degrees acceleration.x|y is the
                // acceleration according to gravity, we'll assume we're on Earth and divide
                // by 9.81 (earth gravity) to get a percentage value, and then multiply that
                // by 90 to convert to degrees.
                'tiltLR': Math.round(((acceleration.x) / 9.81) * -90),
                'tiltFB': Math.round(((acceleration.y + 9.81) / 9.81) * 90 * facingUp)
            };

            Crafty.device._deviceMotionCallback(data);
        },

        /**@
         * #Crafty.device.deviceOrientation
         * @comp Crafty.device
         * @sign public Crafty.device.deviceOrientation(Function callback)
         * @param callback - Callback method executed once as soon as device orientation is change
         *
         * Do something with normalized device orientation data:
         * ~~~
         * {
         *   'tiltLR'    :   'gamma the angle in degrees the device is tilted left-to-right.',
         *   'tiltFB'    :   'beta the angle in degrees the device is tilted front-to-back',
         *   'dir'       :   'alpha the direction the device is facing according to the compass',
         *   'motUD'     :   'The angles values increase as you tilt the device to the right or towards you.'
         * }
         * ~~~
         *
         * @example
         * ~~~
         * // Get DeviceOrientation event normalized data.
         * Crafty.device.deviceOrientation(function(data){
         *     console.log('data.tiltLR : '+Math.round(data.tiltLR)+', data.tiltFB : '+Math.round(data.tiltFB)+', data.dir : '+Math.round(data.dir)+', data.motUD : '+data.motUD+'');
         * });
         * ~~~
         *
         * See browser support at http://caniuse.com/#search=device orientation.
         */
        deviceOrientation: function (func) {
            this._deviceOrientationCallback = func;
            if (Crafty.support.deviceorientation) {
                if (window.DeviceOrientationEvent) {
                    // Listen for the deviceorientation event and handle DeviceOrientationEvent object
                    Crafty.addEvent(this, window, 'deviceorientation', this._normalizeDeviceOrientation);
                } else if (window.OrientationEvent) {
                    // Listen for the MozOrientation event and handle OrientationData object
                    Crafty.addEvent(this, window, 'MozOrientation', this._normalizeDeviceOrientation);
                }
            }
        },

        /**@
         * #Crafty.device.deviceMotion
         * @comp Crafty.device
         * @sign public Crafty.device.deviceMotion(Function callback)
         * @param callback - Callback method executed once as soon as device motion is change
         *
         * Do something with normalized device motion data:
         * ~~~
         * {
         *     'acceleration' : ' Grab the acceleration including gravity from the results',
         *     'rawAcceleration' : 'Display the raw acceleration data',
         *     'facingUp' : 'Z is the acceleration in the Z axis, and if the device is facing up or down',
         *     'tiltLR' : 'Convert the value from acceleration to degrees. acceleration.x is the acceleration according to gravity, we'll assume we're on Earth and divide by 9.81 (earth gravity) to get a percentage value, and then multiply that by 90 to convert to degrees.',
         *     'tiltFB' : 'Convert the value from acceleration to degrees.'
         * }
         * ~~~
         *
         * @example
         * ~~~
         * // Get DeviceMotion event normalized data.
         * Crafty.device.deviceMotion(function(data){
         *     console.log('data.moAccel : '+data.rawAcceleration+', data.moCalcTiltLR : '+Math.round(data.tiltLR)+', data.moCalcTiltFB : '+Math.round(data.tiltFB)+'');
         * });
         * ~~~
         *
         * See browser support at http://caniuse.com/#search=motion.
         */
        deviceMotion: function (func) {
            this._deviceMotionCallback = func;
            if (Crafty.support.devicemotion) {
                if (window.DeviceMotionEvent) {
                    // Listen for the devicemotion event and handle DeviceMotionEvent object
                    Crafty.addEvent(this, window, 'devicemotion', this._normalizeDeviceMotion);
                }
            }
        }
    }
});

},{"./core.js":7}],9:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.diamondIso
     * @category 2D
     * Place entities in a 45deg diamond isometric fashion. It is similar to isometric but has another grid locations
     */
    diamondIso: {
        _tile: {
            width: 0,
            height: 0,
            r: 0
        },
        _map: {
            width: 0,
            height: 0,
            x: 0,
            y: 0
        },

        _origin: {
            x: 0,
            y: 0
        },
        /**@
         * #Crafty.diamondIso.init
         * @comp Crafty.diamondIso
         * @sign public this Crafty.diamondIso.init(Number tileWidth,Number tileHeight,Number mapWidth,Number mapHeight)
         * @param tileWidth - The size of base tile width in Pixel
         * @param tileHeight - The size of base tile height in Pixel
         * @param mapWidth - The width of whole map in Tiles
         * @param mapHeight - The height of whole map in Tiles
         *
         * Method used to initialize the size of the isometric placement.
         * Recommended to use a size alues in the power of `2` (128, 64 or 32).
         * This makes it easy to calculate positions and implement zooming.
         *
         * @example
         * ~~~
         * var iso = Crafty.diamondIso.init(64,128,20,20);
         * ~~~
         *
         * @see Crafty.diamondIso.place
         */
        init: function (tw, th, mw, mh) {
            this._tile.width = parseInt(tw, 10);
            this._tile.height = parseInt(th, 10) || parseInt(tw, 10) / 2;
            this._tile.r = this._tile.width / this._tile.height;

            this._map.width = parseInt(mw, 10);
            this._map.height = parseInt(mh, 10) || parseInt(mw, 10);

            this._origin.x = this._map.height * this._tile.width / 2;
            return this;
        },
        /**@
         * #Crafty.diamondIso.place
         * @comp Crafty.diamondIso
         * @sign public this Crafty.diamondIso.place(Entity tile,Number x, Number y, Number layer)
         * @param x - The `x` position to place the tile
         * @param y - The `y` position to place the tile
         * @param layer - The `z` position to place the tile (calculated by y position * layer)
         * @param tile - The entity that should be position in the isometric fashion
         *
         * Use this method to place an entity in an isometric grid.
         *
         * @example
         * ~~~
         * var iso = Crafty.diamondIso.init(64,128,20,20);
         * isos.place(Crafty.e('2D, DOM, Color').color('red').attr({w:128, h:128}),1,1,2);
         * ~~~
         *
         * @see Crafty.diamondIso.size
         */
        place: function (obj, x, y, layer) {
            var pos = this.pos2px(x, y);
            if (!layer) layer = 1;
            var marginX = 0,
                marginY = 0;
            if (obj.__margin !== undefined) {
                marginX = obj.__margin[0];
                marginY = obj.__margin[1];
            }

            obj.x = pos.left + (marginX);
            obj.y = (pos.top + marginY) - obj.h;
            obj.z = (pos.top) * layer;


        },
        centerAt: function (x, y) {
            var pos = this.pos2px(x, y);
            Crafty.viewport.x = -pos.left + Crafty.viewport.width / 2 - this._tile.width;
            Crafty.viewport.y = -pos.top + Crafty.viewport.height / 2;

        },
        area: function (offset) {
            if (!offset) offset = 0;
            //calculate the corners
            var vp = Crafty.viewport.rect();
            var ow = offset * this._tile.width;
            var oh = offset * this._tile.height;
            vp._x -= (this._tile.width / 2 + ow);
            vp._y -= (this._tile.height / 2 + oh);
            vp._w += (this._tile.width / 2 + ow);
            vp._h += (this._tile.height / 2 + oh);
            /*  Crafty.viewport.x = -vp._x;
            Crafty.viewport.y = -vp._y;
            Crafty.viewport.width = vp._w;
            Crafty.viewport.height = vp._h;   */

            var grid = [];
            for (var y = vp._y, yl = (vp._y + vp._h); y < yl; y += this._tile.height / 2) {
                for (var x = vp._x, xl = (vp._x + vp._w); x < xl; x += this._tile.width / 2) {
                    var row = this.px2pos(x, y);
                    grid.push([~~row.x, ~~row.y]);
                }
            }
            return grid;
        },
        pos2px: function (x, y) {
            return {
                left: ((x - y) * this._tile.width / 2 + this._origin.x),
                top: ((x + y) * this._tile.height / 2)
            };
        },
        px2pos: function (left, top) {
            var x = (left - this._origin.x) / this._tile.r;
            return {
                x: ((top + x) / this._tile.height),
                y: ((top - x) / this._tile.height)
            };
        },

        polygon: function (obj) {

            obj.requires("Collision");
            var marginX = 0,
                marginY = 0;
            if (obj.__margin !== undefined) {
                marginX = obj.__margin[0];
                marginY = obj.__margin[1];
            }
            var points = [
                [marginX - 0, obj.h - marginY - this._tile.height / 2],
                [marginX - this._tile.width / 2, obj.h - marginY - 0],
                [marginX - this._tile.width, obj.h - marginY - this._tile.height / 2],
                [marginX - this._tile.width / 2, obj.h - marginY - this._tile.height]
            ];
            var poly = new Crafty.polygon(points);
            return poly;

        }

    }
});
},{"./core.js":7}],10:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Color
 * @category Graphics
 * Draw a solid color for the entity
 */
Crafty.c("Color", {
    _color: "",
    ready: true,

    init: function () {
        this.bind("Draw", function (e) {
            if (e.type === "DOM") {
                e.style.backgroundColor = this._color;
                e.style.lineHeight = 0;
            } else if (e.type === "canvas") {
                if (this._color) e.ctx.fillStyle = this._color;
                e.ctx.fillRect(e.pos._x, e.pos._y, e.pos._w, e.pos._h);
            }
        });
    },

    /**@
     * #.color
     * @comp Color
     * @trigger Invalidate - when the color changes
     * @sign public this .color(String color)
     * @sign public String .color()
     * @param color - Color of the rectangle
     * Will create a rectangle of solid color for the entity, or return the color if no argument is given.
     *
     * The argument must be a color readable depending on which browser you
     * choose to support.
     *
     * @example
     * ```
     * Crafty.e("2D, DOM, Color")
     *    .color("#969696");
     * ```
     */
    color: function (color) {
        if (!color) return this._color;
        this._color = color;
        this.trigger("Invalidate");
        return this;
    }
});

/**@
 * #Tint
 * @category Graphics
 * Similar to Color by adding an overlay of semi-transparent color.
 *
 * *Note: Currently only works for Canvas*
 */
Crafty.c("Tint", {
    _color: null,
    _strength: 1.0,

    init: function () {
        var draw = function d(e) {
            var context = e.ctx || Crafty.canvas.context;

            context.fillStyle = this._color || "rgba(0,0,0, 0)";
            context.fillRect(e.pos._x, e.pos._y, e.pos._w, e.pos._h);
        };

        this.bind("Draw", draw).bind("RemoveComponent", function (id) {
            if (id === "Tint") this.unbind("Draw", draw);
        });
    },

    /**@
     * #.tint
     * @comp Tint
     * @trigger Invalidate - when the tint is applied
     * @sign public this .tint(String color, Number strength)
     * @param color - The color in hexadecimal
     * @param strength - Level of opacity
     *
     * Modify the color and level opacity to give a tint on the entity.
     *
     * @example
     * ~~~
     * Crafty.e("2D, Canvas, Tint")
     *    .tint("#969696", 0.3);
     * ~~~
     */
    tint: function (color, strength) {
        this._strength = strength;
        this._color = Crafty.toRGB(color, this._strength);

        this.trigger("Invalidate");
        return this;
    }
});

/**@
 * #Image
 * @category Graphics
 * Draw an image with or without repeating (tiling).
 */
Crafty.c("Image", {
    _repeat: "repeat",
    ready: false,

    init: function () {
        var draw = function (e) {
            if (e.type === "canvas") {
                //skip if no image
                if (!this.ready || !this._pattern) return;

                var context = e.ctx;

                context.fillStyle = this._pattern;

                context.save();
                context.translate(e.pos._x, e.pos._y);
                context.fillRect(0, 0, this._w, this._h);
                context.restore();
            } else if (e.type === "DOM") {
                if (this.__image) {
                  e.style.backgroundImage = "url(" + this.__image + ")";
                  e.style.backgroundRepeat = this._repeat;
                }
            }
        };

        this.bind("Draw", draw).bind("RemoveComponent", function (id) {
            if (id === "Image") this.unbind("Draw", draw);
        });
    },

    /**@
     * #.image
     * @comp Image
     * @trigger Invalidate - when the image is loaded
     * @sign public this .image(String url[, String repeat])
     * @param url - URL of the image
     * @param repeat - If the image should be repeated to fill the entity.
     *
     * Draw specified image. Repeat follows CSS syntax (`"no-repeat", "repeat", "repeat-x", "repeat-y"`);
     *
     * *Note: Default repeat is `no-repeat` which is different to standard DOM (which is `repeat`)*
     *
     * If the width and height are `0` and repeat is set to `no-repeat` the width and
     * height will automatically assume that of the image. This is an
     * easy way to create an image without needing sprites.
     *
     * @example
     * Will default to no-repeat. Entity width and height will be set to the images width and height
     * ~~~
     * var ent = Crafty.e("2D, DOM, Image").image("myimage.png");
     * ~~~
     * Create a repeating background.
     * ~~~
     * var bg = Crafty.e("2D, DOM, Image")
     *              .attr({w: Crafty.viewport.width, h: Crafty.viewport.height})
     *              .image("bg.png", "repeat");
     * ~~~
     *
     * @see Crafty.sprite
     */
    image: function (url, repeat) {
        this.__image = url;
        this._repeat = repeat || "no-repeat";

        this.img = Crafty.asset(url);
        if (!this.img) {
            this.img = new Image();
            Crafty.asset(url, this.img);
            this.img.src = url;
            var self = this;

            this.img.onload = function () {
                if (self.has("Canvas")) self._pattern = Crafty.canvas.context.createPattern(self.img, self._repeat);
                self.ready = true;

                if (self._repeat === "no-repeat") {
                    self.w = self.img.width;
                    self.h = self.img.height;
                }

                self.trigger("Invalidate");
            };

            return this;
        } else {
            this.ready = true;
            if (this.has("Canvas")) this._pattern = Crafty.canvas.context.createPattern(this.img, this._repeat);
            if (this._repeat === "no-repeat") {
                this.w = this.img.width;
                this.h = this.img.height;
            }
        }


        this.trigger("Invalidate");

        return this;
    }
});

Crafty.extend({
    /**@
     * #Crafty.toRGB
     * @category Graphics
     * @sign public String Crafty.scene(String hex[, Number alpha])
     * @param hex - a 6 character hex number string representing RGB color
     * @param alpha - The alpha value.
     *
     * Get a rgb string or rgba string (if `alpha` presents).
     *
     * @example
     * ~~~
     * Crafty.toRGB("ffffff"); // rgb(255,255,255)
     * Crafty.toRGB("#ffffff"); // rgb(255,255,255)
     * Crafty.toRGB("ffffff", .5); // rgba(255,255,255,0.5)
     * ~~~
     *
     * @see Text.textColor
     */
    toRGB: function (hex, alpha) {
        hex = (hex.charAt(0) === '#') ? hex.substr(1) : hex;
        var c = [],
            result;

        c[0] = parseInt(hex.substr(0, 2), 16);
        c[1] = parseInt(hex.substr(2, 2), 16);
        c[2] = parseInt(hex.substr(4, 2), 16);

        result = alpha === undefined ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + alpha + ')';

        return result;
    }
});

/**@
 * #Crafty.DrawManager
 * @category Graphics
 * @sign Crafty.DrawManager
 *
 * An internal object manage objects to be drawn and implement
 * the best method of drawing in both DOM and canvas
 */
Crafty.DrawManager = (function () {
    /** Helper function to sort by globalZ */
    function zsort(a, b) {
        return a._globalZ - b._globalZ;
    }

    /** array of dirty rects on screen */
    var dirty_rects = [],
        changed_objs = [],
        /** array of DOMs needed updating */
        dom = [],

        dirtyViewport = false,


        /** recManager: an object for managing dirty rectangles. */
        rectManager = {
            /** Finds smallest rectangles that overlaps a and b, merges them into target */
            merge: function (a, b, target) {
                if (typeof target === 'undefined')
                    target = {};
                // Doing it in this order means we can use either a or b as the target, with no conflict
                target._h = Math.max(a._y + a._h, b._y + b._h);
                target._w = Math.max(a._x + a._w, b._x + b._w);
                target._x = Math.min(a._x, b._x);
                target._y = Math.min(a._y, b._y);
                target._w -= target._x;
                target._h -= target._y;

                return target;
            },

            /** cleans up current dirty state, stores stale state for future passes */
            clean: function () {
                var rect, obj, i;
                for (i = 0, l = changed_objs.length; i < l; i++) {
                    obj = changed_objs[i];
                    rect = obj._mbr || obj;
                    if (typeof obj.staleRect === 'undefined')
                        obj.staleRect = {};
                    obj.staleRect._x = rect._x;
                    obj.staleRect._y = rect._y;
                    obj.staleRect._w = rect._w;
                    obj.staleRect._h = rect._h;

                    obj._changed = false;
                }
                changed_objs.length = 0;
                dirty_rects.length = 0;

            },

            /** Takes the current and previous position of an object, and pushes the dirty regions onto the stack
             *  If the entity has only moved/changed a little bit, the regions are squashed together */
            createDirty: function (obj) {
                var rect = obj._mbr || obj;
                if (obj.staleRect) {
                    //If overlap, merge stale and current position together, then return
                    //Otherwise just push stale rectangle
                    if (rectManager.overlap(obj.staleRect, rect)) {
                        rectManager.merge(obj.staleRect, rect, obj.staleRect);
                        dirty_rects.push(obj.staleRect);
                        return;
                    } else {
                        dirty_rects.push(obj.staleRect);
                    }
                }

                // We use the intermediate "currentRect" so it can be modified without messing with obj
                obj.currentRect._x = rect._x;
                obj.currentRect._y = rect._y;
                obj.currentRect._w = rect._w;
                obj.currentRect._h = rect._h;
                dirty_rects.push(obj.currentRect);

            },

            /** Checks whether two rectangles overlap */
            overlap: function (a, b) {
                return (a._x < b._x + b._w && a._y < b._y + b._h && a._x + a._w > b._x && a._y + a._h > b._y);
            }

        };

    Crafty.bind("InvalidateViewport", function () {
        dirtyViewport = true;
    });
    Crafty.bind("PostRender", function () {
        dirtyViewport = false;
    });

    return {
        /**@
         * #Crafty.DrawManager.total2D
         * @comp Crafty.DrawManager
         *
         * Total number of the entities that have the `2D` component.
         */
        total2D: Crafty("2D").length,

        /**@
         * #Crafty.DrawManager.onScreen
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.onScreen(Object rect)
         * @param rect - A rectangle with field {_x: x_val, _y: y_val, _w: w_val, _h: h_val}
         *
         * Test if a rectangle is completely in viewport
         */
        onScreen: function (rect) {
            return Crafty.viewport._x + rect._x + rect._w > 0 && Crafty.viewport._y + rect._y + rect._h > 0 &&
                Crafty.viewport._x + rect._x < Crafty.viewport.width && Crafty.viewport._y + rect._y < Crafty.viewport.height;
        },

        /**@
         * #Crafty.DrawManager.mergeSet
         * @comp Crafty.DrawManager
         * @sign public Object Crafty.DrawManager.mergeSet(Object set)
         * @param set - an array of rectangular regions
         *
         * Merge any consecutive, overlapping rects into each other.
         * Its an optimization for the redraw regions.
         *
         * The order of set isn't strictly meaningful,
         * but overlapping objects will often cause each other to change,
         * and so might be consecutive.
         */
        mergeSet: function (set) {
            var i = 0;
            while (i < set.length - 1) {
                // If current and next overlap, merge them together into the first, removing the second
                // Then skip the index backwards to compare the previous pair.
                // Otherwise skip forward
                if (rectManager.overlap(set[i], set[i + 1])) {
                    rectManager.merge(set[i], set[i + 1], set[i]);
                    set.splice(i + 1, 1);
                    if (i > 0) i--;
                } else
                    i++;
            }

            return set;
        },

        /**@
         * #Crafty.DrawManager.addCanvas
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.addCanvas(ent)
         * @param ent - The entity to add
         *
         * Add an entity to the list of Canvas objects to draw
         */
        addCanvas: function addCanvas(ent) {
            changed_objs.push(ent);
        },

        /**@
         * #Crafty.DrawManager.addDom
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.addDom(ent)
         * @param ent - The entity to add
         *
         * Add an entity to the list of DOM object to draw
         */
        addDom: function addDom(ent) {
            dom.push(ent);
        },

        /**@
         * #Crafty.DrawManager.debug
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.debug()
         */
        debug: function () {
            console.log(changed_objs, dom);
        },

        /**@
         * #Crafty.DrawManager.drawAll
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.drawAll([Object rect])
         * @param rect - a rectangular region {_x: x_val, _y: y_val, _w: w_val, _h: h_val}
         *
         * - If rect is omitted, redraw within the viewport
         * - If rect is provided, redraw within the rect
         */
        drawAll: function (rect) {
            rect = rect || Crafty.viewport.rect();
            var q = Crafty.map.search(rect),
                i = 0,
                l = q.length,
                ctx = Crafty.canvas.context,
                current;

            ctx.clearRect(rect._x, rect._y, rect._w, rect._h);

            //sort the objects by the global Z
            q.sort(zsort);
            for (; i < l; i++) {
                current = q[i];
                if (current._visible && current.__c.Canvas) {
                    current.draw();
                    current._changed = false;
                }
            }
        },

        /**@
         * #Crafty.DrawManager.boundingRect
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.boundingRect(set)
         * @param set - Undocumented
         *
         * - Calculate the common bounding rect of multiple canvas entities.
         * - Returns coords
         */
        boundingRect: function (set) {
            if (!set || !set.length) return;
            var newset = [],
                i = 1,
                l = set.length,
                current, master = set[0],
                tmp;
            master = [master._x, master._y, master._x + master._w, master._y + master._h];
            while (i < l) {
                current = set[i];
                tmp = [current._x, current._y, current._x + current._w, current._y + current._h];
                if (tmp[0] < master[0]) master[0] = tmp[0];
                if (tmp[1] < master[1]) master[1] = tmp[1];
                if (tmp[2] > master[2]) master[2] = tmp[2];
                if (tmp[3] > master[3]) master[3] = tmp[3];
                i++;
            }
            tmp = master;
            master = {
                _x: tmp[0],
                _y: tmp[1],
                _w: tmp[2] - tmp[0],
                _h: tmp[3] - tmp[1]
            };

            return master;
        },



        /**@
         * #Crafty.DrawManager.renderCanvas
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.renderCanvas()
         *
         * - Triggered by the "RenderScene" event
         * - If the number of rects is over 60% of the total number of objects
         *	do the naive method redrawing `Crafty.DrawManager.drawAll`
         * - Otherwise, clear the dirty regions, and redraw entities overlapping the dirty regions.
         *
         * @see Canvas.draw
         */

        renderCanvas: function () {
            var l = changed_objs.length;
            if (!l && !dirtyViewport) {
                return;
            }

            var i = 0,
                rect, q,
                j, len, obj, ent, ctx = Crafty.canvas.context,
                DM = Crafty.DrawManager;


            if (dirtyViewport) {
                var view = Crafty.viewport;
                ctx.setTransform(view._scale, 0, 0, view._scale, view._x*view._scale, view._y*view._scale);

            }
            //if the amount of changed objects is over 60% of the total objects
            //do the naive method redrawing
            // TODO: I'm not sure this condition really makes that much sense!
            if (l / DM.total2D > 0.6 || dirtyViewport) {
                DM.drawAll();
                rectManager.clean();
                return;
            }

            // Calculate dirty_rects from all changed objects, then merge some overlapping regions together
            for (i = 0; i < l; i++) {
                rectManager.createDirty(changed_objs[i]);
            }
            dirty_rects = DM.mergeSet(dirty_rects);


            l = dirty_rects.length;
            var dupes = [],
                objs = [];
            // For each dirty rectangle, find entities near it, and draw the overlapping ones
            for (i = 0; i < l; ++i) { //loop over every dirty rect
                rect = dirty_rects[i];
                dupes.length = 0;
                objs.length = 0;
                if (!rect) continue;

                // Find the smallest rectangle with integer coordinates that encloses rect
                rect._w = rect._x + rect._w;
                rect._h = rect._y + rect._h;
                rect._x = (rect._x > 0) ? (rect._x|0) : (rect._x|0) - 1;
                rect._y = (rect._y > 0) ? (rect._y|0) : (rect._y|0) - 1;
                rect._w -= rect._x;
                rect._h -= rect._y;
                rect._w = (rect._w === (rect._w|0)) ? rect._w : (rect._w|0) + 1;
                rect._h = (rect._h === (rect._h|0)) ? rect._h : (rect._h|0) + 1;

                //search for ents under dirty rect
                q = Crafty.map.search(rect, false);

                //clear the rect from the main canvas
                ctx.clearRect(rect._x, rect._y, rect._w, rect._h);

                //Then clip drawing region to dirty rectangle
                ctx.save();
                ctx.beginPath();
                ctx.rect(rect._x, rect._y, rect._w, rect._h);
                ctx.clip();

                // Loop over found objects removing dupes and adding visible canvas objects to array
                for (j = 0, len = q.length; j < len; ++j) {
                    obj = q[j];

                    if (dupes[obj[0]] || !obj._visible || !obj.__c.Canvas)
                        continue;
                    dupes[obj[0]] = true;
                    objs.push(obj);
                }

                // Sort objects by z level
                objs.sort(zsort);

                // Then draw each object in that order
                for (j = 0, len = objs.length; j < len; ++j) {
                    obj = objs[j];
                    var area = obj._mbr || obj;
                    if (rectManager.overlap(area, rect))
                        obj.draw();
                    obj._changed = false;
                }

                // Close rectangle clipping
                ctx.closePath();
                ctx.restore();

            }

            // Draw dirty rectangles for debugging, if that flag is set
            if (Crafty.DrawManager.debugDirty === true) {
                ctx.strokeStyle = 'red';
                for (i = 0, l = dirty_rects.length; i < l; ++i) {
                    rect = dirty_rects[i];
                    ctx.strokeRect(rect._x, rect._y, rect._w, rect._h);
                }
            }
            //Clean up lists etc
            rectManager.clean();

        },

        /**@
         * #Crafty.DrawManager.renderDOM
         * @comp Crafty.DrawManager
         * @sign public Crafty.DrawManager.renderDOM()
         *
         * When "RenderScene" is triggered, draws all DOM entities that have been flagged
         *
         * @see DOM.draw
         */
        renderDOM: function () {
            // Adjust the viewport
            if (dirtyViewport) {
                var style = Crafty.stage.inner.style,
                    view = Crafty.viewport;

                style.transform = style[Crafty.support.prefix + "Transform"] = "scale(" + view._scale + ", " + view._scale + ")";
                style.left = view.x * view._scale + "px";
                style.top = view.y * view._scale + "px";
                style.zIndex = 10;
            }

            //if no objects have been changed, stop
            if (!dom.length) return;

            var i = 0,
                k = dom.length;
            //loop over all DOM elements needing updating
            for (; i < k; ++i) {
                dom[i].draw()._changed = false;
            }

            //reset DOM array
            dom.length = 0;

        }


    };
})();

Crafty.extend({
    /**@
     * #Crafty.pixelart
     * @category Graphics
     * @sign public void Crafty.pixelart(Boolean enabled)
     *
     * Sets the image smoothing for drawing images (for both DOM and Canvas).
     * Setting this to true disables smoothing for images, which is the preferred
     * way for drawing pixel art. Defaults to false.
     *
     * This feature is experimental and you should be careful with cross-browser compatibility. 
     * The best way to disable image smoothing is to use the Canvas render method and the Sprite component for drawing your entities.
     *
     * This method will have no effect for Canvas image smoothing if the canvas is not initialized yet.
     *
     * Note that Firefox_26 currently has a [bug](https://bugzilla.mozilla.org/show_bug.cgi?id=696630) 
     * which prevents disabling image smoothing for Canvas entities that use the Image component. Use the Sprite
     * component instead.
     * Note that Webkit (Chrome & Safari) currently has a bug [link1](http://code.google.com/p/chromium/issues/detail?id=134040) 
     * [link2](http://code.google.com/p/chromium/issues/detail?id=106662) that prevents disabling image smoothing
     * for DOM entities.
     *
     * @example
     * This is the preferred way to draw pixel art with the best cross-browser compatibility.
     * ~~~
     * Crafty.canvas.init();
     * Crafty.pixelart(true);
     * 
     * Crafty.sprite(imgWidth, imgHeight, "spriteMap.png", {sprite1:[0,0]});
     * Crafty.e("2D, Canvas, sprite1");
     * ~~~
     */
    pixelart: function(enabled) {
        var context = Crafty.canvas.context;
        if (context) {
            context.imageSmoothingEnabled = !enabled;
            context.mozImageSmoothingEnabled = !enabled;
            context.webkitImageSmoothingEnabled = !enabled;
            context.oImageSmoothingEnabled = !enabled;
            context.msImageSmoothingEnabled = !enabled;
        }

        var style = Crafty.stage.inner.style;
        if (enabled) {
            style[Crafty.DOM.camelize("image-rendering")] = "optimizeSpeed";   /* legacy */
            style[Crafty.DOM.camelize("image-rendering")] = "-moz-crisp-edges";    /* Firefox */
            style[Crafty.DOM.camelize("image-rendering")] = "-o-crisp-edges";  /* Opera */
            style[Crafty.DOM.camelize("image-rendering")] = "-webkit-optimize-contrast";   /* Webkit (Chrome & Safari) */
            style[Crafty.DOM.camelize("-ms-interpolation-mode")] = "nearest-neighbor";  /* IE */
            style[Crafty.DOM.camelize("image-rendering")] = "optimize-contrast";   /* CSS3 proposed */
            style[Crafty.DOM.camelize("image-rendering")] = "pixelated";   /* CSS4 proposed */
            style[Crafty.DOM.camelize("image-rendering")] = "crisp-edges"; /* CSS4 proposed */
        } else {
            style[Crafty.DOM.camelize("image-rendering")] = "optimizeQuality";   /* legacy */
            style[Crafty.DOM.camelize("-ms-interpolation-mode")] = "bicubic";   /* IE */
            style[Crafty.DOM.camelize("image-rendering")] = "auto";   /* CSS3 */
        }
    }
});

},{"./core.js":7}],11:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Crafty.support
 * @category Misc, Core
 * Determines feature support for what Crafty can do.
 */
(function testSupport() {
    var support = Crafty.support = {},
        ua = navigator.userAgent.toLowerCase(),
        match = /(webkit)[ \/]([\w.]+)/.exec(ua) ||
            /(o)pera(?:.*version)?[ \/]([\w.]+)/.exec(ua) ||
            /(ms)ie ([\w.]+)/.exec(ua) ||
            /(moz)illa(?:.*? rv:([\w.]+))?/.exec(ua) || [],
        mobile = /iPad|iPod|iPhone|Android|webOS|IEMobile/i.exec(ua);

    /**@
     * #Crafty.mobile
     * @comp Crafty.device
     *
     * Determines if Crafty is running on mobile device.
     *
     * If Crafty.mobile is equal true Crafty does some things under hood:
     * ~~~
     * - set viewport on max device width and height
     * - set Crafty.stage.fullscreen on true
     * - hide window scrollbars
     * ~~~
     *
     * @see Crafty.viewport
     */
    if (mobile) Crafty.mobile = mobile[0];

    /**@
     * #Crafty.support.setter
     * @comp Crafty.support
     * Is `__defineSetter__` supported?
     */
    support.setter = ('__defineSetter__' in this && '__defineGetter__' in this);

    /**@
     * #Crafty.support.defineProperty
     * @comp Crafty.support
     * Is `Object.defineProperty` supported?
     */
    support.defineProperty = (function () {
        if (!('defineProperty' in Object)) return false;
        try {
            Object.defineProperty({}, 'x', {});
        } catch (e) {
            return false;
        }
        return true;
    })();

    /**@
     * #Crafty.support.audio
     * @comp Crafty.support
     * Is HTML5 `Audio` supported?
     */
    support.audio = ('Audio' in window);

    /**@
     * #Crafty.support.prefix
     * @comp Crafty.support
     * Returns the browser specific prefix (`Moz`, `O`, `ms`, `webkit`).
     */
    support.prefix = (match[1] || match[0]);

    //browser specific quirks
    if (support.prefix === "moz") support.prefix = "Moz";
    if (support.prefix === "o") support.prefix = "O";

    if (match[2]) {
        /**@
         * #Crafty.support.versionName
         * @comp Crafty.support
         * Version of the browser
         */
        support.versionName = match[2];

        /**@
         * #Crafty.support.version
         * @comp Crafty.support
         * Version number of the browser as an Integer (first number)
         */
        support.version = +(match[2].split("."))[0];
    }

    /**@
     * #Crafty.support.canvas
     * @comp Crafty.support
     * Is the `canvas` element supported?
     */
    support.canvas = ('getContext' in document.createElement("canvas"));

    /**@
     * #Crafty.support.webgl
     * @comp Crafty.support
     * Is WebGL supported on the canvas element?
     */
    if (support.canvas) {
        var gl;
        try {
            gl = document.createElement("canvas").getContext("experimental-webgl");
            gl.viewportWidth = support.canvas.width;
            gl.viewportHeight = support.canvas.height;
        } catch (e) {}
        support.webgl = !! gl;
    } else {
        support.webgl = false;
    }

    /**@
     * #Crafty.support.css3dtransform
     * @comp Crafty.support
     * Is css3Dtransform supported by browser.
     */
    support.css3dtransform = (typeof document.createElement("div").style.Perspective !== "undefined") || (typeof document.createElement("div").style[support.prefix + "Perspective"] !== "undefined");

    /**@
     * #Crafty.support.deviceorientation
     * @comp Crafty.support
     * Is deviceorientation event supported by browser.
     */
    support.deviceorientation = (typeof window.DeviceOrientationEvent !== "undefined") || (typeof window.OrientationEvent !== "undefined");

    /**@
     * #Crafty.support.devicemotion
     * @comp Crafty.support
     * Is devicemotion event supported by browser.
     */
    support.devicemotion = (typeof window.DeviceMotionEvent !== "undefined");

})();

Crafty.extend({
    _events: {},

    /**@
     * #Crafty.addEvent
     * @category Events, Misc
     * @sign public this Crafty.addEvent(Object ctx, HTMLElement obj, String event, Function callback)
     * @param ctx - Context of the callback or the value of `this`
     * @param obj - Element to add the DOM event to
     * @param event - Event name to bind to
     * @param callback - Method to execute when triggered
     *
     * Adds DOM level 3 events to elements. The arguments it accepts are the call
     * context (the value of `this`), the DOM element to attach the event to,
     * the event name (without `on` (`click` rather than `onclick`)) and
     * finally the callback method.
     *
     * If no element is passed, the default element will be `window.document`.
     *
     * Callbacks are passed with event data.
     *
     * @example
     * Will add a stage-wide MouseDown event listener to the player. Will log which button was pressed
     * & the (x,y) coordinates in viewport/world/game space.
     * ~~~
     * var player = Crafty.e("2D");
     *     player.onMouseDown = function(e) {
     *         console.log(e.mouseButton, e.realX, e.realY);
     *     };
     * Crafty.addEvent(player, Crafty.stage.elem, "mousedown", player.onMouseDown);
     * ~~~
     * @see Crafty.removeEvent
     */
    addEvent: function (ctx, obj, type, callback) {
        if (arguments.length === 3) {
            callback = type;
            type = obj;
            obj = window.document;
        }

        //save anonymous function to be able to remove
        var afn = function (e) {
            e = e || window.event;

            if (typeof callback === 'function') {
                callback.call(ctx, e);
            }
        },
            id = ctx[0] || "";

        if (!this._events[id + obj + type + callback]) this._events[id + obj + type + callback] = afn;
        else return;

        if (obj.attachEvent) { //IE
            obj.attachEvent('on' + type, afn);
        } else { //Everyone else
            obj.addEventListener(type, afn, false);
        }
    },

    /**@
     * #Crafty.removeEvent
     * @category Events, Misc
     * @sign public this Crafty.removeEvent(Object ctx, HTMLElement obj, String event, Function callback)
     * @param ctx - Context of the callback or the value of `this`
     * @param obj - Element the event is on
     * @param event - Name of the event
     * @param callback - Method executed when triggered
     *
     * Removes events attached by `Crafty.addEvent()`. All parameters must
     * be the same that were used to attach the event including a reference
     * to the callback method.
     *
     * @see Crafty.addEvent
     */
    removeEvent: function (ctx, obj, type, callback) {
        if (arguments.length === 3) {
            callback = type;
            type = obj;
            obj = window.document;
        }

        //retrieve anonymous function
        var id = ctx[0] || "",
            afn = this._events[id + obj + type + callback];

        if (afn) {
            if (obj.detachEvent) {
                obj.detachEvent('on' + type, afn);
            } else obj.removeEventListener(type, afn, false);
            delete this._events[id + obj + type + callback];
        }
    },

    /**@
     * #Crafty.background
     * @category Graphics, Stage
     * @sign public void Crafty.background(String value)
     * @param style - Modify the background with a color or image
     *
     * This method is essentially a shortcut for adding a background
     * style to the stage element.
     */
    background: function (style) {
        Crafty.stage.elem.style.background = style;
    }
});
},{"./core.js":7}],12:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #HTML
 * @category Graphics
 * Component allow for insertion of arbitrary HTML into an entity
 */
Crafty.c("HTML", {
    inner: '',

    init: function () {
        this.requires('2D, DOM');
    },

    /**@
     * #.replace
     * @comp HTML
     * @sign public this .replace(String html)
     * @param html - arbitrary html
     *
     * This method will replace the content of this entity with the supplied html
     *
     * @example
     * Create a link
     * ~~~
     * Crafty.e("HTML")
     *    .attr({x:20, y:20, w:100, h:100})
     *    .replace("<a href='index.html'>Index</a>");
     * ~~~
     */
    replace: function (new_html) {
        this.inner = new_html;
        this._element.innerHTML = new_html;
        return this;
    },

    /**@
     * #.append
     * @comp HTML
     * @sign public this .append(String html)
     * @param html - arbitrary html
     *
     * This method will add the supplied html in the end of the entity
     *
     * @example
     * Create a link
     * ~~~
     * Crafty.e("HTML")
     *    .attr({x:20, y:20, w:100, h:100})
     *    .append("<a href='index.html'>Index</a>");
     * ~~~
     */
    append: function (new_html) {
        this.inner += new_html;
        this._element.innerHTML += new_html;
        return this;
    },

    /**@
     * #.prepend
     * @comp HTML
     * @sign public this .prepend(String html)
     * @param html - arbitrary html
     *
     * This method will add the supplied html in the beginning of the entity
     *
     * @example
     * Create a link
     * ~~~
     * Crafty.e("HTML")
     *    .attr({x:20, y:20, w:100, h:100})
     *    .prepend("<a href='index.html'>Index</a>");
     * ~~~
     */
    prepend: function (new_html) {
        this.inner = new_html + this.inner;
        this._element.innerHTML = new_html + this.inner;
        return this;
    }
});
},{"./core.js":7}],13:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Crafty.import
 * @sign public void Crafty.import(String url[, String scene])
 * @param url - Path to the saved file
 * @param scene - Name of the scene to load if saved multiple scenes
 * @sign public void Crafty.import(Object sceneData)
 * @param sceneData - Scene data generated from builder
 * This method will load in scene data generated by the Crafty Builder.
 *
 * @example
 * ~~~
 * Crafty.import({
 *	'0': {props: value},
 *	'n': [
 *		{c: "comp, list", image: ''}
 *	]
 * });
 * ~~~
 */
Crafty['import'] = function (obj, scene) {
    //if its a string, load the script file
    if (typeof obj === "string") {
        if (levelData) {
            if (scene) Crafty.import(levelData[scene]);
            else Crafty.import(levelData);
        } else {
            var elem;
            elem = document.createElement("script");
            elem.onload = function () {
                if (scene) Crafty.import(levelData[scene]);
                else Crafty.import(levelData);
            };
            elem.src = obj;
        }
        return;
    }

    var key, i = 0,
        l, current, ent;

    //loop over new entities to create
    if (obj.n && typeof obj.n === "object") {
        for (l = obj.n.length; i < l; ++i) {
            current = obj.n[i];

            //create entity with components
            ent = Crafty.e(current.c);
            delete current.c; //remove the components

            //apply the other properties
            ent.attr(current);
        }
    }

    //loop over modified entities
    for (key in obj) {
        ent = Crafty(key);
        ent.attr(obj[key]);
    }
};
},{"./core.js":7}],14:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.isometric
     * @category 2D
     * Place entities in a 45deg isometric fashion.
     */
    isometric: {
        _tile: {
            width: 0,
            height: 0
        },
        _elements: {},
        _pos: {
            x: 0,
            y: 0
        },
        _z: 0,
        /**@
         * #Crafty.isometric.size
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.size(Number tileSize)
         * @param tileSize - The size of the tiles to place.
         *
         * Method used to initialize the size of the isometric placement.
         * Recommended to use a size values in the power of `2` (128, 64 or 32).
         * This makes it easy to calculate positions and implement zooming.
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128);
         * ~~~
         *
         * @see Crafty.isometric.place
         */
        size: function (width, height) {
            this._tile.width = width;
            this._tile.height = height > 0 ? height : width / 2; //Setup width/2 if height isn't set
            return this;
        },
        /**@
         * #Crafty.isometric.place
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.place(Number x, Number y, Number z, Entity tile)
         * @param x - The `x` position to place the tile
         * @param y - The `y` position to place the tile
         * @param z - The `z` position or height to place the tile
         * @param tile - The entity that should be position in the isometric fashion
         *
         * Use this method to place an entity in an isometric grid.
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128);
         * iso.place(2, 1, 0, Crafty.e('2D, DOM, Color').color('red').attr({w:128, h:128}));
         * ~~~
         *
         * @see Crafty.isometric.size
         */
        place: function (x, y, z, obj) {
            var pos = this.pos2px(x, y);
            pos.top -= z * (this._tile.height / 2);
            obj.attr({
                x: pos.left + Crafty.viewport._x,
                y: pos.top + Crafty.viewport._y
            }).z += z;
            return this;
        },
        /**@
         * #Crafty.isometric.pos2px
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.pos2px(Number x,Number y)
         * @param x
         * @param y
         * @return Object {left Number,top Number}
         *
         * This method calculate the X and Y Coordinates to Pixel Positions
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128,96);
         * var position = iso.pos2px(100,100); //Object { left=12800, top=4800}
         * ~~~
         */
        pos2px: function (x, y) {
            return {
                left: x * this._tile.width + (y & 1) * (this._tile.width / 2),
                top: y * this._tile.height / 2
            };
        },
        /**@
         * #Crafty.isometric.px2pos
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.px2pos(Number left,Number top)
         * @param top
         * @param left
         * @return Object {x Number,y Number}
         *
         * This method calculate pixel top,left positions to x,y coordinates
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128,96);
         * var px = iso.pos2px(12800,4800);
         * console.log(px); //Object { x=100, y=100}
         * ~~~
         */
        px2pos: function (left, top) {
            return {
                x: -Math.ceil(-left / this._tile.width - (top & 1) * 0.5),
                y: top / this._tile.height * 2
            };
        },
        /**@
         * #Crafty.isometric.centerAt
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.centerAt(Number x,Number y)
         * @param top
         * @param left
         *
         * This method center the Viewport at x/y location or gives the current centerpoint of the viewport
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128,96).centerAt(10,10); //Viewport is now moved
         * //After moving the viewport by another event you can get the new center point
         * console.log(iso.centerAt());
         * ~~~
         */
        centerAt: function (x, y) {
            if (typeof x == "number" && typeof y == "number") {
                var center = this.pos2px(x, y);
                Crafty.viewport._x = -center.left + Crafty.viewport.width / 2 - this._tile.width / 2;
                Crafty.viewport._y = -center.top + Crafty.viewport.height / 2 - this._tile.height / 2;
                return this;
            } else {
                return {
                    top: -Crafty.viewport._y + Crafty.viewport.height / 2 - this._tile.height / 2,
                    left: -Crafty.viewport._x + Crafty.viewport.width / 2 - this._tile.width / 2
                };
            }
        },
        /**@
         * #Crafty.isometric.area
         * @comp Crafty.isometric
         * @sign public this Crafty.isometric.area()
         * @return Object {x:{start Number,end Number},y:{start Number,end Number}}
         *
         * This method get the Area surrounding by the centerpoint depends on viewport height and width
         *
         * @example
         * ~~~
         * var iso = Crafty.isometric.size(128,96).centerAt(10,10); //Viewport is now moved
         * var area = iso.area(); //get the area
         * for(var y = area.y.start;y <= area.y.end;y++){
         *   for(var x = area.x.start ;x <= area.x.end;x++){
         *       iso.place(x,y,0,Crafty.e("2D,DOM,gras")); //Display tiles in the Screen
         *   }
         * }
         * ~~~
         */
        area: function () {
            //Get the center Point in the viewport
            var center = this.centerAt();
            var start = this.px2pos(-center.left + Crafty.viewport.width / 2, -center.top + Crafty.viewport.height / 2);
            var end = this.px2pos(-center.left - Crafty.viewport.width / 2, -center.top - Crafty.viewport.height / 2);
            return {
                x: {
                    start: start.x,
                    end: end.x
                },
                y: {
                    start: start.y,
                    end: end.y
                }
            };
        }
    }
});

},{"./core.js":7}],15:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.keys
     * @category Input
     * Object of key names and the corresponding key code.
     *
     * ~~~
     * BACKSPACE: 8,
     * TAB: 9,
     * ENTER: 13,
     * PAUSE: 19,
     * CAPS: 20,
     * ESC: 27,
     * SPACE: 32,
     * PAGE_UP: 33,
     * PAGE_DOWN: 34,
     * END: 35,
     * HOME: 36,
     * LEFT_ARROW: 37,
     * UP_ARROW: 38,
     * RIGHT_ARROW: 39,
     * DOWN_ARROW: 40,
     * INSERT: 45,
     * DELETE: 46,
     * 0: 48,
     * 1: 49,
     * 2: 50,
     * 3: 51,
     * 4: 52,
     * 5: 53,
     * 6: 54,
     * 7: 55,
     * 8: 56,
     * 9: 57,
     * A: 65,
     * B: 66,
     * C: 67,
     * D: 68,
     * E: 69,
     * F: 70,
     * G: 71,
     * H: 72,
     * I: 73,
     * J: 74,
     * K: 75,
     * L: 76,
     * M: 77,
     * N: 78,
     * O: 79,
     * P: 80,
     * Q: 81,
     * R: 82,
     * S: 83,
     * T: 84,
     * U: 85,
     * V: 86,
     * W: 87,
     * X: 88,
     * Y: 89,
     * Z: 90,
     * NUMPAD_0: 96,
     * NUMPAD_1: 97,
     * NUMPAD_2: 98,
     * NUMPAD_3: 99,
     * NUMPAD_4: 100,
     * NUMPAD_5: 101,
     * NUMPAD_6: 102,
     * NUMPAD_7: 103,
     * NUMPAD_8: 104,
     * NUMPAD_9: 105,
     * MULTIPLY: 106,
     * ADD: 107,
     * SUBSTRACT: 109,
     * DECIMAL: 110,
     * DIVIDE: 111,
     * F1: 112,
     * F2: 113,
     * F3: 114,
     * F4: 115,
     * F5: 116,
     * F6: 117,
     * F7: 118,
     * F8: 119,
     * F9: 120,
     * F10: 121,
     * F11: 122,
     * F12: 123,
     * SHIFT: 16,
     * CTRL: 17,
     * ALT: 18,
     * PLUS: 187,
     * COMMA: 188,
     * MINUS: 189,
     * PERIOD: 190,
     * PULT_UP: 29460,
     * PULT_DOWN: 29461,
     * PULT_LEFT: 4,
     * PULT_RIGHT': 5
     * ~~~
     */
    keys: {
        'BACKSPACE': 8,
        'TAB': 9,
        'ENTER': 13,
        'PAUSE': 19,
        'CAPS': 20,
        'ESC': 27,
        'SPACE': 32,
        'PAGE_UP': 33,
        'PAGE_DOWN': 34,
        'END': 35,
        'HOME': 36,
        'LEFT_ARROW': 37,
        'UP_ARROW': 38,
        'RIGHT_ARROW': 39,
        'DOWN_ARROW': 40,
        'INSERT': 45,
        'DELETE': 46,
        '0': 48,
        '1': 49,
        '2': 50,
        '3': 51,
        '4': 52,
        '5': 53,
        '6': 54,
        '7': 55,
        '8': 56,
        '9': 57,
        'A': 65,
        'B': 66,
        'C': 67,
        'D': 68,
        'E': 69,
        'F': 70,
        'G': 71,
        'H': 72,
        'I': 73,
        'J': 74,
        'K': 75,
        'L': 76,
        'M': 77,
        'N': 78,
        'O': 79,
        'P': 80,
        'Q': 81,
        'R': 82,
        'S': 83,
        'T': 84,
        'U': 85,
        'V': 86,
        'W': 87,
        'X': 88,
        'Y': 89,
        'Z': 90,
        'NUMPAD_0': 96,
        'NUMPAD_1': 97,
        'NUMPAD_2': 98,
        'NUMPAD_3': 99,
        'NUMPAD_4': 100,
        'NUMPAD_5': 101,
        'NUMPAD_6': 102,
        'NUMPAD_7': 103,
        'NUMPAD_8': 104,
        'NUMPAD_9': 105,
        'MULTIPLY': 106,
        'ADD': 107,
        'SUBSTRACT': 109,
        'DECIMAL': 110,
        'DIVIDE': 111,
        'F1': 112,
        'F2': 113,
        'F3': 114,
        'F4': 115,
        'F5': 116,
        'F6': 117,
        'F7': 118,
        'F8': 119,
        'F9': 120,
        'F10': 121,
        'F11': 122,
        'F12': 123,
        'SHIFT': 16,
        'CTRL': 17,
        'ALT': 18,
        'PLUS': 187,
        'COMMA': 188,
        'MINUS': 189,
        'PERIOD': 190,
        'PULT_UP': 29460,
        'PULT_DOWN': 29461,
        'PULT_LEFT': 4,
        'PULT_RIGHT': 5

    },

    /**@
     * #Crafty.mouseButtons
     * @category Input
     * An object mapping mouseButton names to the corresponding button ID.
     * In all mouseEvents, we add the `e.mouseButton` property with a value normalized to match e.button of modern webkit browsers:
     *
     * ~~~
     * LEFT: 0,
     * MIDDLE: 1,
     * RIGHT: 2
     * ~~~
     */
    mouseButtons: {
        LEFT: 0,
        MIDDLE: 1,
        RIGHT: 2
    }
});
},{"./core.js":7}],16:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.assets
     * @category Assets
     * An object containing every asset used in the current Crafty game.
     * The key is the URL and the value is the `Audio` or `Image` object.
     *
     * If loading an asset, check that it is in this object first to avoid loading twice.
     *
     * @example
     * ~~~
     * var isLoaded = !!Crafty.assets["images/sprite.png"];
     * ~~~
     * @see Crafty.loader
     */
    assets: {},

    /**@
     * #Crafty.asset
     * @category Assets
     *
     * @trigger NewAsset - After setting new asset - Object - key and value of new added asset.
     * @sign public void Crafty.asset(String key, Object asset)
     * @param key - asset url.
     * @param asset - Audio` or `Image` object.
     * Add new asset to assets object.
     *
     * @sign public void Crafty.asset(String key)
     * @param key - asset url.
     * Get asset from assets object.
     *
     * @example
     * ~~~
     * Crafty.asset(key, value);
     * var asset = Crafty.asset(key); //object with key and value fields
     * ~~~
     *
     * @see Crafty.assets
     */
    asset: function (key, value) {
        if (arguments.length === 1) {
            return Crafty.assets[key];
        }

        if (!Crafty.assets[key]) {
            Crafty.assets[key] = value;
            this.trigger("NewAsset", {
                key: key,
                value: value
            });
            return value;
        }
    },
    /**@
     * #Crafty.image_whitelist
     * @category Assets
     *
     *
     * A list of file extensions that can be loaded as images by Crafty.load
     *
     * @example
     * ~~~
     * Crafty.image_whitelist.push("tif")
     * Crafty.load(["images/sprite.tif", "sounds/jump.mp3"],
     *     function() {
     *         //when loaded
     *         Crafty.scene("main"); //go to main scene
     *         Crafty.audio.play("jump.mp3"); //Play the audio file
     *     },
     *
     *     function(e) {
     *       //progress
     *     },
     *
     *     function(e) {
     *       //uh oh, error loading
     *     }
     * );
     * ~~~
     *
     * @see Crafty.asset
     * @see Crafty.load
     */
    image_whitelist: ["jpg", "jpeg", "gif", "png", "svg"],
    /**@
     * #Crafty.loader
     * @category Assets
     * @sign public void Crafty.load(Array assets, Function onLoad[, Function onProgress, Function onError])
     * @param assets - Array of assets to load (accepts sounds and images)
     * @param onLoad - Callback when the assets are loaded
     * @param onProgress - Callback when an asset is loaded. Contains information about assets loaded
     * @param onError - Callback when an asset fails to load
     *
     * Preloader for all assets. Takes an array of URLs and
     * adds them to the `Crafty.assets` object.
     *
     * Files with suffixes in `image_whitelist` (case insensitive) will be loaded.
     *
     * If `Crafty.support.audio` is `true`, files with the following suffixes `mp3`, `wav`, `ogg` and `mp4` (case insensitive) can be loaded.
     *
     * The `onProgress` function will be passed on object with information about
     * the progress including how many assets loaded, total of all the assets to
     * load and a percentage of the progress.
     * ~~~
     * { loaded: j, total: total, percent: (j / total * 100) ,src:src})
     * ~~~
     *
     * `onError` will be passed with the asset that couldn't load.
     *
     * When `onError` is not provided, the onLoad is loaded even some assets are not successfully loaded. Otherwise, onLoad will be called no matter whether there are errors or not.
     *
     * @example
     * ~~~
     * Crafty.load(["images/sprite.png", "sounds/jump.mp3"],
     *     function() {
     *         //when loaded
     *         Crafty.scene("main"); //go to main scene
     *         Crafty.audio.play("jump.mp3"); //Play the audio file
     *     },
     *
     *     function(e) {
     *       //progress
     *     },
     *
     *     function(e) {
     *       //uh oh, error loading
     *     }
     * );
     * ~~~
     *
     * @see Crafty.assets
     * @see Crafty.image_whitelist
     */
    load: function (data, oncomplete, onprogress, onerror) {

        var i = 0,
            l = data.length,
            current, obj, total = l,
            j = 0,
            ext = "";

        //Progress function

        function pro() {
            var src = this.src;

            //Remove events cause audio trigger this event more than once(depends on browser)
            if (this.removeEventListener) {
                this.removeEventListener('canplaythrough', pro, false);
            }

            ++j;
            //if progress callback, give information of assets loaded, total and percent
            if (onprogress)
                onprogress({
                    loaded: j,
                    total: total,
                    percent: (j / total * 100),
                    src: src
                });

            if (j === total && oncomplete) oncomplete();
        }
        //Error function

        function err() {
            var src = this.src;
            if (onerror)
                onerror({
                    loaded: j,
                    total: total,
                    percent: (j / total * 100),
                    src: src
                });

            j++;
            if (j === total && oncomplete) oncomplete();
        }

        for (; i < l; ++i) {
            current = data[i];
            ext = current.substr(current.lastIndexOf('.') + 1, 3).toLowerCase();

            obj = Crafty.asset(current) || null;

            if (Crafty.audio.supports(ext)) {
                //Create a new asset if necessary, using the file name as an id
                if (!obj) {
                    var name = current.substr(current.lastIndexOf('/') + 1).toLowerCase();
                    obj = Crafty.audio.create(name, current).obj;
                }

                //addEventListener is supported on IE9 , Audio as well
                if (obj.addEventListener) {
                    obj.addEventListener('canplaythrough', pro, false);
                }


            } else if (Crafty.image_whitelist.indexOf(ext) >= 0) {
                if (!obj) {
                    obj = new Image();
                    Crafty.asset(current, obj);
                }
                obj.onload = pro;
                if (Crafty.support.prefix === 'webkit') {
                    obj.src = ""; // workaround for webkit bug
                }
                obj.src = current; //setup src after onload function Opera/IE Bug

            } else {
                total--;
                continue; //skip if not applicable
            }
            obj.onerror = err;
        }

        // If we aren't trying to handle *any* of the files, that's as complete as it gets!
        if (total === 0)
            oncomplete();

    },
    /**@
     * #Crafty.modules
     * @category Assets
     * @sign public void Crafty.modules([String repoLocation,] Object moduleMap[, Function onLoad])
     * @param modules - Map of name:version pairs for modules to load
     * @param onLoad - Callback when the modules are loaded
     *
     * Browse the selection of community modules on http://craftycomponents.com
     *
     * It is possible to create your own repository.
     *
     *
     * @example
     * ~~~
     * // Loading from default repository
     * Crafty.modules({ moveto: 'DEV' }, function () {
     *     //module is ready
     *     Crafty.e("MoveTo, 2D, DOM");
     * });
     *
     * // Loading from your own server
     * Crafty.modules({ 'http://mydomain.com/js/mystuff.js': 'DEV' }, function () {
     *     //module is ready
     *     Crafty.e("MoveTo, 2D, DOM");
     * });
     *
     * // Loading from alternative repository
     * Crafty.modules('http://cdn.crafty-modules.com', { moveto: 'DEV' }, function () {
     *     //module is ready
     *     Crafty.e("MoveTo, 2D, DOM");
     * });
     *
     * // Loading from the latest component website
     * Crafty.modules(
     *     'http://cdn.craftycomponents.com'
     *     , { MoveTo: 'release' }
     *     , function () {
     *     Crafty.e("2D, DOM, Color, MoveTo")
     *       .attr({x: 0, y: 0, w: 50, h: 50})
     *       .color("green");
     *     });
     * });
     * ~~~
     *
     */
    modules: function (modulesRepository, moduleMap, oncomplete) {

        if (arguments.length === 2 && typeof modulesRepository === "object") {
            oncomplete = moduleMap;
            moduleMap = modulesRepository;
            modulesRepository = 'http://cdn.craftycomponents.com';
        }

        /*!
         * $script.js Async loader & dependency manager
         * https://github.com/ded/script.js
         * (c) Dustin Diaz, Jacob Thornton 2011
         * License: MIT
         */
        var $script = (function () {
            var win = this,
                doc = document,
                head = doc.getElementsByTagName('head')[0],
                validBase = /^https?:\/\//,
                old = win.$script,
                list = {}, ids = {}, delay = {}, scriptpath, scripts = {}, s = 'string',
                f = false,
                push = 'push',
                domContentLoaded = 'DOMContentLoaded',
                readyState = 'readyState',
                addEventListener = 'addEventListener',
                onreadystatechange = 'onreadystatechange';

                function every(ar, fn, i) {
                    for (i = 0, j = ar.length; i < j; ++i)
                        if (!fn(ar[i])) return f;
                    return 1;
                }

                function each(ar, fn) {
                    every(ar, function (el) {
                        return !fn(el);
                    });
                }

            if (!doc[readyState] && doc[addEventListener]) {
                doc[addEventListener](domContentLoaded, function fn() {
                    doc.removeEventListener(domContentLoaded, fn, f);
                    doc[readyState] = 'complete';
                }, f);
                doc[readyState] = 'loading';
            }

            function $script(paths, idOrDone, optDone) {
                paths = paths[push] ? paths : [paths];
                var idOrDoneIsDone = idOrDone && idOrDone.call,
                    done = idOrDoneIsDone ? idOrDone : optDone,
                    id = idOrDoneIsDone ? paths.join('') : idOrDone,
                    queue = paths.length;

                    function loopFn(item) {
                        return item.call ? item() : list[item];
                    }

                    function callback() {
                        if (!--queue) {
                            list[id] = 1;
                            if (done)
                                done();
                            for (var dset in delay) {
                                if (every(dset.split('|'), loopFn) && !each(delay[dset], loopFn))
                                    delay[dset] = [];
                            }
                        }
                    }
                setTimeout(function () {
                    each(paths, function (path) {
                        if (scripts[path]) {
                            if (id)
                                ids[id] = 1;
                            return scripts[path] == 2 && callback();
                        }
                        scripts[path] = 1;
                        if (id)
                            ids[id] = 1;
                        create(!validBase.test(path) && scriptpath ? scriptpath + path + '.js' : path, callback);
                    });
                }, 0);
                return $script;
            }

            function create(path, fn) {
                var el = doc.createElement('script'),
                    loaded = f;
                    el.onload = el.onerror = el[onreadystatechange] = function () {
                        if ((el[readyState] && !(/^c|loade/.test(el[readyState]))) || loaded) return;
                        el.onload = el[onreadystatechange] = null;
                        loaded = 1;
                        scripts[path] = 2;
                        fn();
                    };
                el.async = 1;
                el.src = path;
                head.insertBefore(el, head.firstChild);
            }

            $script.get = create;

            $script.order = function (scripts, id, done) {
                (function callback(s) {
                    s = scripts.shift();
                    if (!scripts.length) $script(s, id, done);
                    else $script(s, callback);
                }());
            };

            $script.path = function (p) {
                scriptpath = p;
            };
            // This function is a tangled mess of conciseness, so suppress warnings here
            /* jshint -W030 */
            $script.ready = function (deps, ready, req) {
                deps = deps[push] ? deps : [deps];
                var missing = [];
                !each(deps, function (dep) {
                    list[dep] || missing[push](dep);
                }) && every(deps, function (dep) {
                    return list[dep];
                }) ?
                    ready() : ! function (key) {
                        delay[key] = delay[key] || [];
                        delay[key][push](ready);
                        req && req(missing);
                }(deps.join('|'));
                return $script;
            };
            /* jshint +W030 */
            $script.noConflict = function () {
                win.$script = old;
                return this;
            };

            return $script;
        })();

        var modules = [];
        var validBase = /^(https?|file):\/\//;
        for (var i in moduleMap) {
            if (validBase.test(i))
                modules.push(i);
            else
                modules.push(modulesRepository + '/' + i.toLowerCase() + '-' + moduleMap[i].toLowerCase() + '.js');
        }

        $script(modules, function () {
            if (oncomplete) oncomplete();
        });
    }
});

},{"./core.js":7}],17:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Crafty.math
 * @category 2D
 * Static functions.
 */
Crafty.math = {
    /**@
     * #Crafty.math.abs
     * @comp Crafty.math
     * @sign public this Crafty.math.abs(Number n)
     * @param n - Some value.
     * @return Absolute value.
     *
     * Returns the absolute value.
     */
    abs: function (x) {
        return x < 0 ? -x : x;
    },

    /**@
     * #Crafty.math.amountOf
     * @comp Crafty.math
     * @sign public Number Crafty.math.amountOf(Number checkValue, Number minValue, Number maxValue)
     * @param checkValue - Value that should checked with minimum and maximum.
     * @param minValue - Minimum value to check.
     * @param maxValue - Maximum value to check.
     * @return Amount of checkValue compared to minValue and maxValue.
     *
     * Returns the amount of how much a checkValue is more like minValue (=0)
     * or more like maxValue (=1)
     */
    amountOf: function (checkValue, minValue, maxValue) {
        if (minValue < maxValue)
            return (checkValue - minValue) / (maxValue - minValue);
        else
            return (checkValue - maxValue) / (minValue - maxValue);
    },


    /**@
     * #Crafty.math.clamp
     * @comp Crafty.math
     * @sign public Number Crafty.math.clamp(Number value, Number min, Number max)
     * @param value - A value.
     * @param max - Maximum that value can be.
     * @param min - Minimum that value can be.
     * @return The value between minimum and maximum.
     *
     * Restricts a value to be within a specified range.
     */
    clamp: function (value, min, max) {
        if (value > max)
            return max;
        else if (value < min)
            return min;
        else
            return value;
    },

    /**@
     * #Crafty.math.degToRad
     * Converts angle from degree to radian.
     * @comp Crafty.math
     * @param angleInDeg - The angle in degree.
     * @return The angle in radian.
     */
    degToRad: function (angleInDeg) {
        return angleInDeg * Math.PI / 180;
    },

    /**@
     * #Crafty.math.distance
     * @comp Crafty.math
     * @sign public Number Crafty.math.distance(Number x1, Number y1, Number x2, Number y2)
     * @param x1 - First x coordinate.
     * @param y1 - First y coordinate.
     * @param x2 - Second x coordinate.
     * @param y2 - Second y coordinate.
     * @return The distance between the two points.
     *
     * Distance between two points.
     */
    distance: function (x1, y1, x2, y2) {
        var squaredDistance = Crafty.math.squaredDistance(x1, y1, x2, y2);
        return Math.sqrt(parseFloat(squaredDistance));
    },

    /**@
     * #Crafty.math.lerp
     * @comp Crafty.math
     * @sign public Number Crafty.math.lerp(Number value1, Number value2, Number amount)
     * @param value1 - One value.
     * @param value2 - Another value.
     * @param amount - Amount of value2 to value1.
     * @return Linear interpolated value.
     *
     * Linear interpolation. Passing amount with a value of 0 will cause value1 to be returned,
     * a value of 1 will cause value2 to be returned.
     */
    lerp: function (value1, value2, amount) {
        return value1 + (value2 - value1) * amount;
    },

    /**@
     * #Crafty.math.negate
     * @comp Crafty.math
     * @sign public Number Crafty.math.negate(Number percent)
     * @param percent - If you pass 1 a -1 will be returned. If you pass 0 a 1 will be returned.
     * @return 1 or -1.
     *
     * Returnes "randomly" -1.
     */
    negate: function (percent) {
        if (Math.random() < percent)
            return -1;
        else
            return 1;
    },

    /**@
     * #Crafty.math.radToDeg
     * @comp Crafty.math
     * @sign public Number Crafty.math.radToDeg(Number angle)
     * @param angleInRad - The angle in radian.
     * @return The angle in degree.
     *
     * Converts angle from radian to degree.
     */
    radToDeg: function (angleInRad) {
        return angleInRad * 180 / Math.PI;
    },

    /**@
     * #Crafty.math.randomElementOfArray
     * @comp Crafty.math
     * @sign public Object Crafty.math.randomElementOfArray(Array array)
     * @param array - A specific array.
     * @return A random element of a specific array.
     *
     * Returns a random element of a specific array.
     */
    randomElementOfArray: function (array) {
        return array[Math.floor(array.length * Math.random())];
    },

    /**@
     * #Crafty.math.randomInt
     * @comp Crafty.math
     * @sign public Number Crafty.math.randomInt(Number start, Number end)
     * @param start - Smallest int value that can be returned.
     * @param end - Biggest int value that can be returned.
     * @return A random int.
     *
     * Returns a random int in within a specific range.
     */
    randomInt: function (start, end) {
        return start + Math.floor((1 + end - start) * Math.random());
    },

    /**@
     * #Crafty.math.randomNumber
     * @comp Crafty.math
     * @sign public Number Crafty.math.randomNumber(Number start, Number end)
     * @param start - Smallest number value that can be returned.
     * @param end - Biggest number value that can be returned.
     * @return A random number.
     *
     * Returns a random number in within a specific range.
     */
    randomNumber: function (start, end) {
        return start + (end - start) * Math.random();
    },

    /**@
     * #Crafty.math.squaredDistance
     * @comp Crafty.math
     * @sign public Number Crafty.math.squaredDistance(Number x1, Number y1, Number x2, Number y2)
     * @param x1 - First x coordinate.
     * @param y1 - First y coordinate.
     * @param x2 - Second x coordinate.
     * @param y2 - Second y coordinate.
     * @return The squared distance between the two points.
     *
     * Squared distance between two points.
     */
    squaredDistance: function (x1, y1, x2, y2) {
        return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
    },

    /**@
     * #Crafty.math.withinRange
     * @comp Crafty.math
     * @sign public Boolean Crafty.math.withinRange(Number value, Number min, Number max)
     * @param value - The specific value.
     * @param min - Minimum value.
     * @param max - Maximum value.
     * @return Returns true if value is within a specific range.
     *
     * Check if a value is within a specific range.
     */
    withinRange: function (value, min, max) {
        return (value >= min && value <= max);
    }
};

Crafty.math.Vector2D = (function () {
    /**@
     * #Crafty.math.Vector2D
     * @category 2D
     * @class This is a general purpose 2D vector class
     *
     * Vector2D uses the following form:
     * <x, y>
     *
     * @public
     * @sign public {Vector2D} Vector2D();
     * @sign public {Vector2D} Vector2D(Vector2D);
     * @sign public {Vector2D} Vector2D(Number, Number);
     * @param {Vector2D|Number=0} x
     * @param {Number=0} y
     */

    function Vector2D(x, y) {
        if (x instanceof Vector2D) {
            this.x = x.x;
            this.y = x.y;
        } else if (arguments.length === 2) {
            this.x = x;
            this.y = y;
        } else if (arguments.length > 0)
            throw "Unexpected number of arguments for Vector2D()";
    } // class Vector2D

    Vector2D.prototype.x = 0;
    Vector2D.prototype.y = 0;

    /**@
     * #.add
     * @comp Crafty.math.Vector2D
     *
     * Adds the passed vector to this vector
     *
     * @public
     * @sign public {Vector2D} add(Vector2D);
     * @param {vector2D} vecRH
     * @returns {Vector2D} this after adding
     */
    Vector2D.prototype.add = function (vecRH) {
        this.x += vecRH.x;
        this.y += vecRH.y;
        return this;
    }; // add

    /**@
     * #.angleBetween
     * @comp Crafty.math.Vector2D
     *
     * Calculates the angle between the passed vector and this vector, using <0,0> as the point of reference.
     * Angles returned have the range (−π, π].
     *
     * @public
     * @sign public {Number} angleBetween(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Number} the angle between the two vectors in radians
     */
    Vector2D.prototype.angleBetween = function (vecRH) {
        return Math.atan2(this.x * vecRH.y - this.y * vecRH.x, this.x * vecRH.x + this.y * vecRH.y);
    }; // angleBetween

    /**@
     * #.angleTo
     * @comp Crafty.math.Vector2D
     *
     * Calculates the angle to the passed vector from this vector, using this vector as the point of reference.
     *
     * @public
     * @sign public {Number} angleTo(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Number} the angle to the passed vector in radians
     */
    Vector2D.prototype.angleTo = function (vecRH) {
        return Math.atan2(vecRH.y - this.y, vecRH.x - this.x);
    };

    /**@
     * #.clone
     * @comp Crafty.math.Vector2D
     *
     * Creates and exact, numeric copy of this vector
     *
     * @public
     * @sign public {Vector2D} clone();
     * @returns {Vector2D} the new vector
     */
    Vector2D.prototype.clone = function () {
        return new Vector2D(this);
    }; // clone

    /**@
     * #.distance
     * @comp Crafty.math.Vector2D
     *
     * Calculates the distance from this vector to the passed vector.
     *
     * @public
     * @sign public {Number} distance(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Number} the distance between the two vectors
     */
    Vector2D.prototype.distance = function (vecRH) {
        return Math.sqrt((vecRH.x - this.x) * (vecRH.x - this.x) + (vecRH.y - this.y) * (vecRH.y - this.y));
    }; // distance

    /**@
     * #.distanceSq
     * @comp Crafty.math.Vector2D
     *
     * Calculates the squared distance from this vector to the passed vector.
     * This function avoids calculating the square root, thus being slightly faster than .distance( ).
     *
     * @public
     * @sign public {Number} distanceSq(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Number} the squared distance between the two vectors
     * @see .distance
     */
    Vector2D.prototype.distanceSq = function (vecRH) {
        return (vecRH.x - this.x) * (vecRH.x - this.x) + (vecRH.y - this.y) * (vecRH.y - this.y);
    }; // distanceSq

    /**@
     * #.divide
     * @comp Crafty.math.Vector2D
     *
     * Divides this vector by the passed vector.
     *
     * @public
     * @sign public {Vector2D} divide(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Vector2D} this vector after dividing
     */
    Vector2D.prototype.divide = function (vecRH) {
        this.x /= vecRH.x;
        this.y /= vecRH.y;
        return this;
    }; // divide

    /**@
     * #.dotProduct
     * @comp Crafty.math.Vector2D
     *
     * Calculates the dot product of this and the passed vectors
     *
     * @public
     * @sign public {Number} dotProduct(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Number} the resultant dot product
     */
    Vector2D.prototype.dotProduct = function (vecRH) {
        return this.x * vecRH.x + this.y * vecRH.y;
    }; // dotProduct

    /**@
     * #.equals
     * @comp Crafty.math.Vector2D
     *
     * Determines if this vector is numerically equivalent to the passed vector.
     *
     * @public
     * @sign public {Boolean} equals(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Boolean} true if the vectors are equivalent
     */
    Vector2D.prototype.equals = function (vecRH) {
        return vecRH instanceof Vector2D &&
            this.x == vecRH.x && this.y == vecRH.y;
    }; // equals

    /**@
     * #.getNormal
     * @comp Crafty.math.Vector2D
     *
     * Calculates a new right-handed normal vector for the line created by this and the passed vectors.
     *
     * @public
     * @sign public {Vector2D} getNormal([Vector2D]);
     * @param {Vector2D=<0,0>} [vecRH]
     * @returns {Vector2D} the new normal vector
     */
    Vector2D.prototype.getNormal = function (vecRH) {
        if (vecRH === undefined)
            return new Vector2D(-this.y, this.x); // assume vecRH is <0, 0>
        return new Vector2D(vecRH.y - this.y, this.x - vecRH.x).normalize();
    }; // getNormal

    /**@
     * #.isZero
     * @comp Crafty.math.Vector2D
     *
     * Determines if this vector is equal to <0,0>
     *
     * @public
     * @sign public {Boolean} isZero();
     * @returns {Boolean} true if this vector is equal to <0,0>
     */
    Vector2D.prototype.isZero = function () {
        return this.x === 0 && this.y === 0;
    }; // isZero

    /**@
     * #.magnitude
     * @comp Crafty.math.Vector2D
     *
     * Calculates the magnitude of this vector.
     * Note: Function objects in JavaScript already have a 'length' member, hence the use of magnitude instead.
     *
     * @public
     * @sign public {Number} magnitude();
     * @returns {Number} the magnitude of this vector
     */
    Vector2D.prototype.magnitude = function () {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }; // magnitude

    /**@
     * #.magnitudeSq
     * @comp Crafty.math.Vector2D
     *
     * Calculates the square of the magnitude of this vector.
     * This function avoids calculating the square root, thus being slightly faster than .magnitude( ).
     *
     * @public
     * @sign public {Number} magnitudeSq();
     * @returns {Number} the square of the magnitude of this vector
     * @see .magnitude
     */
    Vector2D.prototype.magnitudeSq = function () {
        return this.x * this.x + this.y * this.y;
    }; // magnitudeSq

    /**@
     * #.multiply
     * @comp Crafty.math.Vector2D
     *
     * Multiplies this vector by the passed vector
     *
     * @public
     * @sign public {Vector2D} multiply(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {Vector2D} this vector after multiplying
     */
    Vector2D.prototype.multiply = function (vecRH) {
        this.x *= vecRH.x;
        this.y *= vecRH.y;
        return this;
    }; // multiply

    /**@
     * #.negate
     * @comp Crafty.math.Vector2D
     *
     * Negates this vector (ie. <-x,-y>)
     *
     * @public
     * @sign public {Vector2D} negate();
     * @returns {Vector2D} this vector after negation
     */
    Vector2D.prototype.negate = function () {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }; // negate

    /**@
     * #.normalize
     * @comp Crafty.math.Vector2D
     *
     * Normalizes this vector (scales the vector so that its new magnitude is 1)
     * For vectors where magnitude is 0, <1,0> is returned.
     *
     * @public
     * @sign public {Vector2D} normalize();
     * @returns {Vector2D} this vector after normalization
     */
    Vector2D.prototype.normalize = function () {
        var lng = Math.sqrt(this.x * this.x + this.y * this.y);

        if (lng === 0) {
            // default due East
            this.x = 1;
            this.y = 0;
        } else {
            this.x /= lng;
            this.y /= lng;
        } // else

        return this;
    }; // normalize

    /**@
     * #.scale
     * @comp Crafty.math.Vector2D
     *
     * Scales this vector by the passed amount(s)
     * If scalarY is omitted, scalarX is used for both axes
     *
     * @public
     * @sign public {Vector2D} scale(Number[, Number]);
     * @param {Number} scalarX
     * @param {Number} [scalarY]
     * @returns {Vector2D} this after scaling
     */
    Vector2D.prototype.scale = function (scalarX, scalarY) {
        if (scalarY === undefined)
            scalarY = scalarX;

        this.x *= scalarX;
        this.y *= scalarY;

        return this;
    }; // scale

    /**@
     * #.scaleToMagnitude
     * @comp Crafty.math.Vector2D
     *
     * Scales this vector such that its new magnitude is equal to the passed value.
     *
     * @public
     * @sign public {Vector2D} scaleToMagnitude(Number);
     * @param {Number} mag
     * @returns {Vector2D} this vector after scaling
     */
    Vector2D.prototype.scaleToMagnitude = function (mag) {
        var k = mag / this.magnitude();
        this.x *= k;
        this.y *= k;
        return this;
    }; // scaleToMagnitude

    /**@
     * #.setValues
     * @comp Crafty.math.Vector2D
     *
     * Sets the values of this vector using a passed vector or pair of numbers.
     *
     * @public
     * @sign public {Vector2D} setValues(Vector2D);
     * @sign public {Vector2D} setValues(Number, Number);
     * @param {Number|Vector2D} x
     * @param {Number} y
     * @returns {Vector2D} this vector after setting of values
     */
    Vector2D.prototype.setValues = function (x, y) {
        if (x instanceof Vector2D) {
            this.x = x.x;
            this.y = x.y;
        } else {
            this.x = x;
            this.y = y;
        } // else

        return this;
    }; // setValues

    /**@
     * #.subtract
     * @comp Crafty.math.Vector2D
     *
     * Subtracts the passed vector from this vector.
     *
     * @public
     * @sign public {Vector2D} subtract(Vector2D);
     * @param {Vector2D} vecRH
     * @returns {vector2D} this vector after subtracting
     */
    Vector2D.prototype.subtract = function (vecRH) {
        this.x -= vecRH.x;
        this.y -= vecRH.y;
        return this;
    }; // subtract

    /**@
     * #.toString
     * @comp Crafty.math.Vector2D
     *
     * Returns a string representation of this vector.
     *
     * @public
     * @sign public {String} toString();
     * @returns {String}
     */
    Vector2D.prototype.toString = function () {
        return "Vector2D(" + this.x + ", " + this.y + ")";
    }; // toString

    /**@
     * #.translate
     * @comp Crafty.math.Vector2D
     *
     * Translates (moves) this vector by the passed amounts.
     * If dy is omitted, dx is used for both axes.
     *
     * @public
     * @sign public {Vector2D} translate(Number[, Number]);
     * @param {Number} dx
     * @param {Number} [dy]
     * @returns {Vector2D} this vector after translating
     */
    Vector2D.prototype.translate = function (dx, dy) {
        if (dy === undefined)
            dy = dx;

        this.x += dx;
        this.y += dy;

        return this;
    }; // translate

    /**@
     * #.tripleProduct
     * @comp Crafty.math.Vector2D
     *
     * Calculates the triple product of three vectors.
     * triple vector product = b(a•c) - a(b•c)
     *
     * @public
     * @static
     * @sign public {Vector2D} tripleProduct(Vector2D, Vector2D, Vector2D);
     * @param {Vector2D} a
     * @param {Vector2D} b
     * @param {Vector2D} c
     * @return {Vector2D} the triple product as a new vector
     */
    Vector2D.tripleProduct = function (a, b, c) {
        var ac = a.dotProduct(c);
        var bc = b.dotProduct(c);
        return new Crafty.math.Vector2D(b.x * ac - a.x * bc, b.y * ac - a.y * bc);
    };

    return Vector2D;
})();

Crafty.math.Matrix2D = (function () {
    /**@
     * #Crafty.math.Matrix2D
     * @category 2D
     *
     * @class This is a 2D Matrix2D class. It is 3x3 to allow for affine transformations in 2D space.
     * The third row is always assumed to be [0, 0, 1].
     *
     * Matrix2D uses the following form, as per the whatwg.org specifications for canvas.transform():
     * [a, c, e]
     * [b, d, f]
     * [0, 0, 1]
     *
     * @public
     * @sign public {Matrix2D} new Matrix2D();
     * @sign public {Matrix2D} new Matrix2D(Matrix2D);
     * @sign public {Matrix2D} new Matrix2D(Number, Number, Number, Number, Number, Number);
     * @param {Matrix2D|Number=1} a
     * @param {Number=0} b
     * @param {Number=0} c
     * @param {Number=1} d
     * @param {Number=0} e
     * @param {Number=0} f
     */
    Matrix2D = function (a, b, c, d, e, f) {
        if (a instanceof Matrix2D) {
            this.a = a.a;
            this.b = a.b;
            this.c = a.c;
            this.d = a.d;
            this.e = a.e;
            this.f = a.f;
        } else if (arguments.length === 6) {
            this.a = a;
            this.b = b;
            this.c = c;
            this.d = d;
            this.e = e;
            this.f = f;
        } else if (arguments.length > 0)
            throw "Unexpected number of arguments for Matrix2D()";
    }; // class Matrix2D

    Matrix2D.prototype.a = 1;
    Matrix2D.prototype.b = 0;
    Matrix2D.prototype.c = 0;
    Matrix2D.prototype.d = 1;
    Matrix2D.prototype.e = 0;
    Matrix2D.prototype.f = 0;

    /**@
     * #.apply
     * @comp Crafty.math.Matrix2D
     *
     * Applies the matrix transformations to the passed object
     *
     * @public
     * @sign public {Vector2D} apply(Vector2D);
     * @param {Vector2D} vecRH - vector to be transformed
     * @returns {Vector2D} the passed vector object after transforming
     */
    Matrix2D.prototype.apply = function (vecRH) {
        // I'm not sure of the best way for this function to be implemented. Ideally
        // support for other objects (rectangles, polygons, etc) should be easily
        // addable in the future. Maybe a function (apply) is not the best way to do
        // this...?

        var tmpX = vecRH.x;
        vecRH.x = tmpX * this.a + vecRH.y * this.c + this.e;
        vecRH.y = tmpX * this.b + vecRH.y * this.d + this.f;
        // no need to homogenize since the third row is always [0, 0, 1]

        return vecRH;
    }; // apply

    /**@
     * #.clone
     * @comp Crafty.math.Matrix2D
     *
     * Creates an exact, numeric copy of the current matrix
     *
     * @public
     * @sign public {Matrix2D} clone();
     * @returns {Matrix2D}
     */
    Matrix2D.prototype.clone = function () {
        return new Matrix2D(this);
    }; // clone

    /**@
     * #.combine
     * @comp Crafty.math.Matrix2D
     *
     * Multiplies this matrix with another, overriding the values of this matrix.
     * The passed matrix is assumed to be on the right-hand side.
     *
     * @public
     * @sign public {Matrix2D} combine(Matrix2D);
     * @param {Matrix2D} mtrxRH
     * @returns {Matrix2D} this matrix after combination
     */
    Matrix2D.prototype.combine = function (mtrxRH) {
        var tmp = this.a;
        this.a = tmp * mtrxRH.a + this.b * mtrxRH.c;
        this.b = tmp * mtrxRH.b + this.b * mtrxRH.d;
        tmp = this.c;
        this.c = tmp * mtrxRH.a + this.d * mtrxRH.c;
        this.d = tmp * mtrxRH.b + this.d * mtrxRH.d;
        tmp = this.e;
        this.e = tmp * mtrxRH.a + this.f * mtrxRH.c + mtrxRH.e;
        this.f = tmp * mtrxRH.b + this.f * mtrxRH.d + mtrxRH.f;
        return this;
    }; // combine

    /**@
     * #.equals
     * @comp Crafty.math.Matrix2D
     *
     * Checks for the numeric equality of this matrix versus another.
     *
     * @public
     * @sign public {Boolean} equals(Matrix2D);
     * @param {Matrix2D} mtrxRH
     * @returns {Boolean} true if the two matrices are numerically equal
     */
    Matrix2D.prototype.equals = function (mtrxRH) {
        return mtrxRH instanceof Matrix2D &&
            this.a == mtrxRH.a && this.b == mtrxRH.b && this.c == mtrxRH.c &&
            this.d == mtrxRH.d && this.e == mtrxRH.e && this.f == mtrxRH.f;
    }; // equals

    /**@
     * #.determinant
     * @comp Crafty.math.Matrix2D
     *
     * Calculates the determinant of this matrix
     *
     * @public
     * @sign public {Number} determinant();
     * @returns {Number} det(this matrix)
     */
    Matrix2D.prototype.determinant = function () {
        return this.a * this.d - this.b * this.c;
    }; // determinant

    /**@
     * #.invert
     * @comp Crafty.math.Matrix2D
     *
     * Inverts this matrix if possible
     *
     * @public
     * @sign public {Matrix2D} invert();
     * @returns {Matrix2D} this inverted matrix or the original matrix on failure
     * @see .isInvertible
     */
    Matrix2D.prototype.invert = function () {
        var det = this.determinant();

        // matrix is invertible if its determinant is non-zero
        if (det !== 0) {
            var old = {
                a: this.a,
                b: this.b,
                c: this.c,
                d: this.d,
                e: this.e,
                f: this.f
            };
            this.a = old.d / det;
            this.b = -old.b / det;
            this.c = -old.c / det;
            this.d = old.a / det;
            this.e = (old.c * old.f - old.e * old.d) / det;
            this.f = (old.e * old.b - old.a * old.f) / det;
        } // if

        return this;
    }; // invert

    /**@
     * #.isIdentity
     * @comp Crafty.math.Matrix2D
     *
     * Returns true if this matrix is the identity matrix
     *
     * @public
     * @sign public {Boolean} isIdentity();
     * @returns {Boolean}
     */
    Matrix2D.prototype.isIdentity = function () {
        return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
    }; // isIdentity

    /**@
     * #.isInvertible
     * @comp Crafty.math.Matrix2D
     *
     * Determines is this matrix is invertible.
     *
     * @public
     * @sign public {Boolean} isInvertible();
     * @returns {Boolean} true if this matrix is invertible
     * @see .invert
     */
    Matrix2D.prototype.isInvertible = function () {
        return this.determinant() !== 0;
    }; // isInvertible

    /**@
     * #.preRotate
     * @comp Crafty.math.Matrix2D
     *
     * Applies a counter-clockwise pre-rotation to this matrix
     *
     * @public
     * @sign public {Matrix2D} preRotate(Number);
     * @param {number} rads - angle to rotate in radians
     * @returns {Matrix2D} this matrix after pre-rotation
     */
    Matrix2D.prototype.preRotate = function (rads) {
        var nCos = Math.cos(rads);
        var nSin = Math.sin(rads);

        var tmp = this.a;
        this.a = nCos * tmp - nSin * this.b;
        this.b = nSin * tmp + nCos * this.b;
        tmp = this.c;
        this.c = nCos * tmp - nSin * this.d;
        this.d = nSin * tmp + nCos * this.d;

        return this;
    }; // preRotate

    /**@
     * #.preScale
     * @comp Crafty.math.Matrix2D
     *
     * Applies a pre-scaling to this matrix
     *
     * @public
     * @sign public {Matrix2D} preScale(Number[, Number]);
     * @param {Number} scalarX
     * @param {Number} [scalarY] scalarX is used if scalarY is undefined
     * @returns {Matrix2D} this after pre-scaling
     */
    Matrix2D.prototype.preScale = function (scalarX, scalarY) {
        if (scalarY === undefined)
            scalarY = scalarX;

        this.a *= scalarX;
        this.b *= scalarY;
        this.c *= scalarX;
        this.d *= scalarY;

        return this;
    }; // preScale

    /**@
     * #.preTranslate
     * @comp Crafty.math.Matrix2D
     *
     * Applies a pre-translation to this matrix
     *
     * @public
     * @sign public {Matrix2D} preTranslate(Vector2D);
     * @sign public {Matrix2D} preTranslate(Number, Number);
     * @param {Number|Vector2D} dx
     * @param {Number} dy
     * @returns {Matrix2D} this matrix after pre-translation
     */
    Matrix2D.prototype.preTranslate = function (dx, dy) {
        if (typeof dx === "number") {
            this.e += dx;
            this.f += dy;
        } else {
            this.e += dx.x;
            this.f += dx.y;
        } // else

        return this;
    }; // preTranslate

    /**@
     * #.rotate
     * @comp Crafty.math.Matrix2D
     *
     * Applies a counter-clockwise post-rotation to this matrix
     *
     * @public
     * @sign public {Matrix2D} rotate(Number);
     * @param {Number} rads - angle to rotate in radians
     * @returns {Matrix2D} this matrix after rotation
     */
    Matrix2D.prototype.rotate = function (rads) {
        var nCos = Math.cos(rads);
        var nSin = Math.sin(rads);

        var tmp = this.a;
        this.a = nCos * tmp - nSin * this.b;
        this.b = nSin * tmp + nCos * this.b;
        tmp = this.c;
        this.c = nCos * tmp - nSin * this.d;
        this.d = nSin * tmp + nCos * this.d;
        tmp = this.e;
        this.e = nCos * tmp - nSin * this.f;
        this.f = nSin * tmp + nCos * this.f;

        return this;
    }; // rotate

    /**@
     * #.scale
     * @comp Crafty.math.Matrix2D
     *
     * Applies a post-scaling to this matrix
     *
     * @public
     * @sign public {Matrix2D} scale(Number[, Number]);
     * @param {Number} scalarX
     * @param {Number} [scalarY] scalarX is used if scalarY is undefined
     * @returns {Matrix2D} this after post-scaling
     */
    Matrix2D.prototype.scale = function (scalarX, scalarY) {
        if (scalarY === undefined)
            scalarY = scalarX;

        this.a *= scalarX;
        this.b *= scalarY;
        this.c *= scalarX;
        this.d *= scalarY;
        this.e *= scalarX;
        this.f *= scalarY;

        return this;
    }; // scale

    /**@
     * #.setValues
     * @comp Crafty.math.Matrix2D
     *
     * Sets the values of this matrix
     *
     * @public
     * @sign public {Matrix2D} setValues(Matrix2D);
     * @sign public {Matrix2D} setValues(Number, Number, Number, Number, Number, Number);
     * @param {Matrix2D|Number} a
     * @param {Number} b
     * @param {Number} c
     * @param {Number} d
     * @param {Number} e
     * @param {Number} f
     * @returns {Matrix2D} this matrix containing the new values
     */
    Matrix2D.prototype.setValues = function (a, b, c, d, e, f) {
        if (a instanceof Matrix2D) {
            this.a = a.a;
            this.b = a.b;
            this.c = a.c;
            this.d = a.d;
            this.e = a.e;
            this.f = a.f;
        } else {
            this.a = a;
            this.b = b;
            this.c = c;
            this.d = d;
            this.e = e;
            this.f = f;
        } // else

        return this;
    }; // setValues

    /**@
     * #.toString
     * @comp Crafty.math.Matrix2D
     *
     * Returns the string representation of this matrix.
     *
     * @public
     * @sign public {String} toString();
     * @returns {String}
     */
    Matrix2D.prototype.toString = function () {
        return "Matrix2D([" + this.a + ", " + this.c + ", " + this.e +
            "] [" + this.b + ", " + this.d + ", " + this.f + "] [0, 0, 1])";
    }; // toString

    /**@
     * #.translate
     * @comp Crafty.math.Matrix2D
     *
     * Applies a post-translation to this matrix
     *
     * @public
     * @sign public {Matrix2D} translate(Vector2D);
     * @sign public {Matrix2D} translate(Number, Number);
     * @param {Number|Vector2D} dx
     * @param {Number} dy
     * @returns {Matrix2D} this matrix after post-translation
     */
    Matrix2D.prototype.translate = function (dx, dy) {
        if (typeof dx === "number") {
            this.e += this.a * dx + this.c * dy;
            this.f += this.b * dx + this.d * dy;
        } else {
            this.e += this.a * dx.x + this.c * dx.y;
            this.f += this.b * dx.x + this.d * dx.y;
        } // else

        return this;
    }; // translate

    return Matrix2D;
})();
},{"./core.js":7}],18:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    _scenes: {},
    _current: null,

    /**@
     * #Crafty.scene
     * @category Scenes, Stage
     * @trigger SceneChange - just before a new scene is initialized - { oldScene:String, newScene:String }
     * @trigger SceneDestroy - just before the current scene is destroyed - { newScene:String  }
     *
     * @sign public void Crafty.scene(String sceneName, Function init[, Function uninit])
     * @param sceneName - Name of the scene to add
     * @param init - Function to execute when scene is played
     * @param uninit - Function to execute before next scene is played, after entities with `2D` are destroyed
     * This is equivalent to calling `Crafty.defineScene`.
     *
     * @sign public void Crafty.scene(String sceneName[, Data])
     * @param sceneName - Name of scene to play
     * @param Data - The init function of the scene will be called with this data as its parameter.  Can be of any type other than a function.
     * This is equivalent to calling `Crafty.enterScene`.
     *
     * Method to create scenes on the stage. Pass an ID and function to register a scene.
     *
     * To play a scene, just pass the ID. When a scene is played, all
     * previously-created entities with the `2D` component are destroyed. The
     * viewport is also reset.
     *
     * You can optionally specify an arugment that will be passed to the scene's init function.
     *
     * If you want some entities to persist over scenes (as in, not be destroyed)
     * simply add the component `Persist`.
     *
     * @example
     * ~~~
     * Crafty.defineScene("loading", function() {
     *     Crafty.background("#000");
     *     Crafty.e("2D, DOM, Text")
     *           .attr({ w: 100, h: 20, x: 150, y: 120 })
     *           .text("Loading")
     *           .css({ "text-align": "center"})
     *           .textColor("#FFFFFF");
     * });
     *
     * Crafty.defineScene("UFO_dance",
     *              function() {Crafty.background("#444"); Crafty.e("UFO");},
     *              function() {...send message to server...});
     *
     * // An example of an init function which accepts arguments, in this case an object.
     * Crafty.defineScene("square", function(attributes) {
     *     Crafty.background("#000");
     *     Crafty.e("2D, DOM, Color")
     *           .attr(attributes)
     *           .color("red");
     * 
     * });
     *
     * ~~~
     * This defines (but does not play) two scenes as discussed below.
     * ~~~
     * Crafty.enterScene("loading");
     * ~~~
     * This command will clear the stage by destroying all `2D` entities (except
     * those with the `Persist` component). Then it will set the background to
     * black and display the text "Loading".
     * ~~~
     * Crafty.enterScene("UFO_dance");
     * ~~~
     * This command will clear the stage by destroying all `2D` entities (except
     * those with the `Persist` component). Then it will set the background to
     * gray and create a UFO entity. Finally, the next time the game encounters
     * another command of the form `Crafty.scene(scene_name)` (if ever), then the
     * game will send a message to the server.
     * ~~~
     * Crafty.enterScene("square", {x:10, y:10, w:20, h:20});
     * ~~~
     * This will clear the stage, set the background black, and create a red square with the specified position and dimensions.
     * ~~~
     */
    scene: function (name, intro, outro) {
        // If there's one argument, or the second argument isn't a function, play the scene
        if (arguments.length === 1 || typeof(arguments[1]) !== "function") {
            Crafty.enterScene(name, arguments[1]);
            return;
        }
        // Otherwise, this is a call to create a scene
        Crafty.defineScene(name, intro, outro);
    },

    /* 
     * #Crafty.defineScene
     * @category Scenes, Stage
     *
     * @sign public void Crafty.enterScene(String name[, Data])
     * @param name - Name of the scene to run.
     * @param Data - The init function of the scene will be called with this data as its parameter.  Can be of any type other than a function.
     *
     * @see Crafty.enterScene
     * @see Crafty.scene
     */
    defineScene: function(name, init, uninit){
        if (typeof init !== "function")
            throw("Init function is the wrong type.");
        this._scenes[name] = {};
        this._scenes[name].initialize = init;
        if (typeof uninit !== 'undefined') {
            this._scenes[name].uninitialize = uninit;
        }
        return;

    },

    /* 
     * #Crafty.enterScene
     * @category Scenes, Stage
     * @trigger SceneChange - just before a new scene is initialized - { oldScene:String, newScene:String }
     * @trigger SceneDestroy - just before the current scene is destroyed - { newScene:String  }
     *
     * @sign public void Crafty.enterScene(String name[, Data])
     * @param name - Name of the scene to run.
     * @param Data - The init function of the scene will be called with this data as its parameter.  Can be of any type other than a function.
     * 
     * @see Crafty.defineScene
     * @see Crafty.scene
     */
    enterScene: function(name, data){
        if (typeof data === "function")
            throw("Scene data cannot be a function");

        // ---FYI---
        // this._current is the name (ID) of the scene in progress.
        // this._scenes is an object like the following:
        // {'Opening scene': {'initialize': fnA, 'uninitialize': fnB},
        //  'Another scene': {'initialize': fnC, 'uninitialize': fnD}}

        Crafty.trigger("SceneDestroy", {
            newScene: name
        });
        Crafty.viewport.reset();

        Crafty("2D").each(function () {
            if (!this.has("Persist")) this.destroy();
        });
        // uninitialize previous scene
        if (this._current !== null && 'uninitialize' in this._scenes[this._current]) {
            this._scenes[this._current].uninitialize.call(this);
        }
        // initialize next scene
        var oldScene = this._current;
        this._current = name;
        Crafty.trigger("SceneChange", {
            oldScene: oldScene,
            newScene: name
        });
        this._scenes[name].initialize.call(this, data);

        return;

    }
});
},{"./core.js":7}],19:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.audio
     * @category Audio
     *
     * Add sound files and play them. Chooses best format for browser support.
     * Due to the nature of HTML5 audio, three types of audio files will be
     * required for cross-browser capabilities. These formats are MP3, Ogg and WAV.
     * When sound was not muted on before pause, sound will be unmuted after unpause.
     * When sound is muted Crafty.pause() does not have any effect on sound
     *
     * The maximum number of sounds that can be played simultaneously is defined by Crafty.audio.maxChannels.  The default value is 7.
     */
    audio: {

        sounds: {},
        supported: null,
        codecs: { // Chart from jPlayer
            ogg: 'audio/ogg; codecs="vorbis"', //OGG
            wav: 'audio/wav; codecs="1"', // PCM
            webma: 'audio/webm; codecs="vorbis"', // WEBM
            mp3: 'audio/mpeg; codecs="mp3"', //MP3
            m4a: 'audio/mp4; codecs="mp4a.40.2"' // AAC / MP4
        },
        volume: 1, //Global Volume
        muted: false,
        paused: false,
        playCheck: null,
        /**
         * Function to setup supported formats
         **/
        _canPlay: function () {
            this.supported = {};
            // Without support, no formats are supported
            if (!Crafty.support.audio)
                return;
            var audio = this.audioElement(),
                canplay;
            for (var i in this.codecs) {
                canplay = audio.canPlayType(this.codecs[i]);
                if (canplay !== "" && canplay !== "no") {
                    this.supported[i] = true;
                } else {
                    this.supported[i] = false;
                }
            }

        },

        /**@
         * #Crafty.audio.supports
         * @comp Crafty.audio
         * @sign public this Crafty.audio.supports(String extension)
         * @param extension - A file extension to check audio support for
         *
         * Return true if the browser thinks it can play the given file type, otherwise false
         */
        supports: function (extension) {
            // Build cache of supported formats, if necessary
            if (this.supported === null)
                this._canPlay();

            if (this.supported[extension])
                return true;
            else
                return false;
        },

        /**
         * Function to get an Audio Element
         **/
        audioElement: function () {
            //IE does not support Audio Object
            return typeof Audio !== 'undefined' ? new Audio("") : document.createElement('audio');
        },

        /**@
         * #Crafty.audio.create
         * @comp Crafty.audio
         * @sign public this Crafty.audio.create(String id, String url)
         * @param id - A string to refer to sounds
         * @param url - A string pointing to the sound file
         *
         * Creates an audio asset with the given id and resource.  `Crafty.audio.add` is a more flexible interface that allows cross-browser compatibility.
         *
         * If the sound file extension is not supported, returns false; otherwise, returns the audio asset.
         */
        create: function (id, path) {
            //check extension, return if not supported
            var ext = path.substr(path.lastIndexOf('.') + 1).toLowerCase();
            if (!this.supports(ext))
                return false;

            //initiate the audio element
            var audio = this.audioElement();
            audio.id = id;
            audio.preload = "auto";
            audio.volume = Crafty.audio.volume;
            audio.src = path;

            //create an asset and metadata for the audio element
            Crafty.asset(path, audio);
            this.sounds[id] = {
                obj: audio,
                played: 0,
                volume: Crafty.audio.volume
            };
            return this.sounds[id];

        },

        /**@
         * #Crafty.audio.add
         * @comp Crafty.audio
         * @sign public this Crafty.audio.add(String id, String url)
         * @param id - A string to refer to sounds
         * @param url - A string pointing to the sound file
         * @sign public this Crafty.audio.add(String id, Array urls)
         * @param urls - Array of urls pointing to different format of the same sound, selecting the first that is playable
         * @sign public this Crafty.audio.add(Object map)
         * @param map - key-value pairs where the key is the `id` and the value is either a `url` or `urls`
         *
         * Loads a sound to be played. Due to the nature of HTML5 audio,
         * three types of audio files will be required for cross-browser capabilities.
         * These formats are MP3, Ogg and WAV.
         *
         * Passing an array of URLs will determine which format the browser can play and select it over any other.
         *
         * Accepts an object where the key is the audio name and
         * either a URL or an Array of URLs (to determine which type to use).
         *
         * The ID you use will be how you refer to that sound when using `Crafty.audio.play`.
         *
         * @example
         * ~~~
         * //adding audio from an object
         * Crafty.audio.add({
         * shoot: ["sounds/shoot.wav",
         * "sounds/shoot.mp3",
         * "sounds/shoot.ogg"],
         *
         * coin: "sounds/coin.mp3"
         * });
         *
         * //adding a single sound
         * Crafty.audio.add("walk", [
         * "sounds/walk.mp3",
         * "sounds/walk.ogg",
         * "sounds/walk.wav"
         * ]);
         *
         * //only one format
         * Crafty.audio.add("jump", "sounds/jump.mp3");
         * ~~~
         */
        add: function (id, url) {
            if (!Crafty.support.audio)
                return;

            var src;

            if (arguments.length === 1 && typeof id === "object") {
                for (var i in id) {
                    for (src in id[i]) {
                        if (Crafty.audio.create(i, id[i][src]))
                            break;
                    }
                }
            }
            if (typeof id === "string") {
                if (typeof url === "string") {
                    Crafty.audio.create(id, url);
                }

                if (typeof url === "object") {
                    for (src in url) {
                        if (Crafty.audio.create(id, url[src]))
                            break;
                    }
                }

            }
        },
        /**@
         * #Crafty.audio.play
         * @comp Crafty.audio
         * @sign public this Crafty.audio.play(String id)
         * @sign public this Crafty.audio.play(String id, Number repeatCount)
         * @sign public this Crafty.audio.play(String id, Number repeatCount, Number volume)
         * @param id - A string to refer to sounds
         * @param repeatCount - Repeat count for the file, where -1 stands for repeat forever.
         * @param volume - volume can be a number between 0.0 and 1.0
         * @returns The audio element used to play the sound.  Null if the call failed due to a lack of open channels.
         *
         * Will play a sound previously added by using the ID that was used in `Crafty.audio.add`.
         * Has a default maximum of 5 channels so that the same sound can play simultaneously unless all of the channels are playing.

         * *Note that the implementation of HTML5 Audio is buggy at best.*
         *
         * @example
         * ~~~
         * Crafty.audio.play("walk");
         *
         * //play and repeat forever
         * Crafty.audio.play("backgroundMusic", -1);
         * Crafty.audio.play("explosion",1,0.5); //play sound once with volume of 50%
         * ~~~
         */
        play: function (id, repeat, volume) {
            if (repeat === 0 || !Crafty.support.audio || !this.sounds[id])
                return;
            var s = this.sounds[id];
            var c = this.getOpenChannel();
            if (!c)
                return null;
            c.id = id;
            c.repeat = repeat;
            var a = c.obj;


            c.volume = s.volume = s.obj.volume = volume || Crafty.audio.volume;

            a.volume = s.volume;
            a.src = s.obj.src;

            if (this.muted)
                a.volume = 0;
            a.play();
            s.played++;
            c.onEnd = function () {
                if (s.played < c.repeat || repeat == -1) {
                    if (this.currentTime)
                        this.currentTime = 0;
                    this.play();
                    s.played++;
                } else {
                    c.active = false;
                    this.pause();
                    this.removeEventListener("ended", c.onEnd, true);
                    this.currentTime = 0;
                    Crafty.trigger("SoundComplete", {
                        id: c.id
                    });
                }

            };
            a.addEventListener("ended", c.onEnd, true);

            return a;
        },



        /**@
         * #Crafty.audio.setChannels
         * @comp Crafty.audio
         * @sign public this Crafty.audio.setChannels(Number n)
         * @param n - The maximum number of channels
         */
        maxChannels: 7,
        setChannels: function (n) {
            this.maxChannels = n;
            if (n < this.channels.length)
                this.channels.length = n;
        },

        channels: [],
        // Finds an unused audio element, marks it as in use, and return it.
        getOpenChannel: function () {
            for (var i = 0; i < this.channels.length; i++) {
                var chan = this.channels[i];
                  /*
                   * Second test looks for stuff that's out of use,
                   * but fallen foul of Chromium bug 280417
                   */
                if (chan.active === false ||
                      chan.obj.ended && chan.repeat <= this.sounds[chan.id].played) {
                    chan.active = true;
                    return chan;
                }
            }
            // If necessary, create a new element, unless we've already reached the max limit
            if (i < this.maxChannels) {
                var c = {
                    obj: this.audioElement(),
                    active: true,
                    // Checks that the channel is being used to play sound id
                    _is: function (id) {
                        return this.id === id && this.active;
                    }
                };
                this.channels.push(c);
                return c;
            }
            // In that case, return null
            return null;
        },

        /**@
         * #Crafty.audio.remove
         * @comp Crafty.audio
         * @sign public this Crafty.audio.remove([String id])
         * @param id - A string to refer to sounds
         *
         * Will stop the sound and remove all references to the audio object allowing the browser to free the memory.
         * If no id is given, all sounds will be removed.
         *
         * @example
         * ~~~
         * Crafty.audio.remove("walk");
         * ~~~
         */
        remove: function (id) {
            if (!Crafty.support.audio)
                return;

            var s;

            if (!id) {
                for (var i in this.sounds) {
                    s = this.sounds[i];
                    Crafty.audio.stop(id);
                    delete Crafty.assets[s.obj.src];
                    delete Crafty.audio.sounds[id];
                }
                return;
            }
            if (!this.sounds[id])
                return;

            s = this.sounds[id];
            Crafty.audio.stop(id);
            delete Crafty.assets[s.obj.src];
            delete Crafty.audio.sounds[id];
        },
        /**@
         * #Crafty.audio.stop
         * @comp Crafty.audio
         * @sign public this Crafty.audio.stop([Number ID])
         *
         * Stops any playing sound. if id is not set, stop all sounds which are playing
         *
         * @example
         * ~~~
         * //all sounds stopped playing now
         * Crafty.audio.stop();
         *
         * ~~~
         */
        stop: function (id) {
            if (!Crafty.support.audio)
                return;
            for (var i in this.channels) {
                c = this.channels[i];
                if ( (!id && c.active) || c._is(id) ) {
                    c.active = false;
                    c.obj.pause();
                }
            }
            return;
        },
        /**
         * #Crafty.audio._mute
         * @comp Crafty.audio
         * @sign public this Crafty.audio._mute([Boolean mute])
         *
         * Mute or unmute every Audio instance that is playing.
         */
        _mute: function (mute) {
            if (!Crafty.support.audio)
                return;
            var c;
            for (var i in this.channels) {
                c = this.channels[i];
                c.obj.volume = mute ? 0 : c.volume;
            }
            this.muted = mute;
        },
        /**@
         * #Crafty.audio.toggleMute
         * @comp Crafty.audio
         * @sign public this Crafty.audio.toggleMute()
         *
         * Mute or unmute every Audio instance that is playing. Toggles between
         * pausing or playing depending on the state.
         *
         * @example
         * ~~~
         * //toggle mute and unmute depending on current state
         * Crafty.audio.toggleMute();
         * ~~~
         */
        toggleMute: function () {
            if (!this.muted) {
                this._mute(true);
            } else {
                this._mute(false);
            }

        },
        /**@
         * #Crafty.audio.mute
         * @comp Crafty.audio
         * @sign public this Crafty.audio.mute()
         *
         * Mute every Audio instance that is playing.
         *
         * @example
         * ~~~
         * Crafty.audio.mute();
         * ~~~
         */
        mute: function () {
            this._mute(true);
        },
        /**@
         * #Crafty.audio.unmute
         * @comp Crafty.audio
         * @sign public this Crafty.audio.unmute()
         *
         * Unmute every Audio instance that is playing.
         *
         * @example
         * ~~~
         * Crafty.audio.unmute();
         * ~~~
         */
        unmute: function () {
            this._mute(false);
        },

        /**@
         * #Crafty.audio.pause
         * @comp Crafty.audio
         * @sign public this Crafty.audio.pause(string ID)
         * @param {string} id - The id of the audio object to pause
         *
         * Pause the Audio instance specified by id param.
         *
         * @example
         * ~~~
         * Crafty.audio.pause('music');
         * ~~~
         *
         */
        pause: function (id) {
            if (!Crafty.support.audio || !id || !this.sounds[id])
                return;
            var c;
            for (var i in this.channels) {
                c = this.channels[i];
                if (c._is(id) && !c.obj.paused)
                    c.obj.pause();
            }

        },

        /**@
         * #Crafty.audio.unpause
         * @comp Crafty.audio
         * @sign public this Crafty.audio.unpause(string ID)
         * @param {string} id - The id of the audio object to unpause
         *
         * Resume playing the Audio instance specified by id param.
         *
         * @example
         * ~~~
         * Crafty.audio.unpause('music');
         * ~~~
         *
         */
        unpause: function (id) {
            if (!Crafty.support.audio || !id || !this.sounds[id])
                return;
            var c;
            for (var i in this.channels) {
                c = this.channels[i];
                if (c._is(id) && c.obj.paused)
                    c.obj.play();
            }
        },

        /**@
         * #Crafty.audio.togglePause
         * @comp Crafty.audio
         * @sign public this Crafty.audio.togglePause(string ID)
         * @param {string} id - The id of the audio object to pause/
         *
         * Toggle the pause status of the Audio instance specified by id param.
         *
         * @example
         * ~~~
         * Crafty.audio.togglePause('music');
         * ~~~
         *
         */
        togglePause: function (id) {
            if (!Crafty.support.audio || !id || !this.sounds[id])
                return;
            var c;
            for (var i in this.channels) {
                c = this.channels[i];
                if (c._is(id)) {
                    if (c.obj.paused) {
                        c.obj.play();
                    } else {
                        c.obj.pause();
                    }
                }
            }
        }
    }
});

},{"./core.js":7}],20:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({

    /**@
     * #Crafty.sprite
     * @category Graphics
     * @sign public this Crafty.sprite([Number tile, [Number tileh]], String url, Object map[, Number paddingX[, Number paddingY[, Boolean paddingAroundBorder]]])
     * @param tile - Tile size of the sprite map, defaults to 1
     * @param tileh - Height of the tile; if provided, tile is interpreted as the width
     * @param url - URL of the sprite image
     * @param map - Object where the key is what becomes a new component and the value points to a position on the sprite map
     * @param paddingX - Horizontal space in between tiles. Defaults to 0.
     * @param paddingY - Vertical space in between tiles. Defaults to paddingX.
     * @param paddingAroundBorder - If padding should be applied around the border of the sprite sheet. If enabled the first tile starts at (paddingX,paddingY) instead of (0,0). Defaults to false.
     * Generates components based on positions in a sprite image to be applied to entities.
     *
     * Accepts a tile size, URL and map for the name of the sprite and its position.
     *
     * The position must be an array containing the position of the sprite where index `0`
     * is the `x` position, `1` is the `y` position and optionally `2` is the width and `3`
     * is the height. If the sprite map has padding, pass the values for the `x` padding
     * or `y` padding. If they are the same, just add one value.
     *
     * If the sprite image has no consistent tile size, `1` or no argument need be
     * passed for tile size.
     *
     * Entities that add the generated components are also given the `2D` component, and
     * a component called `Sprite`.
     *
     * @example
     * ~~~
     * Crafty.sprite("imgs/spritemap6.png", {flower:[0,0,20,30]});
     * var flower_entity = Crafty.e("2D, DOM, flower");
     * ~~~
     * The first line creates a component called `flower` associated with the sub-image of
     * spritemap6.png with top-left corner (0,0), width 20 pixels, and height 30 pixels.
     * The second line creates an entity with that image. (Note: The `2D` is not really
     * necessary here, because adding the `flower` component automatically also adds the
     * `2D` component.)
     * ~~~
     * Crafty.sprite(50, "imgs/spritemap6.png", {flower:[0,0], grass:[0,1,3,1]});
     * ~~~
     * In this case, the `flower` component is pixels 0 <= x < 50, 0 <= y < 50, and the
     * `grass` component is pixels 0 <= x < 150, 50 <= y < 100. (The `3` means grass has a
     * width of 3 tiles, i.e. 150 pixels.)
     * ~~~
     * Crafty.sprite(50, 100, "imgs/spritemap6.png", {flower:[0,0], grass:[0,1]}, 10);
     * ~~~
     * In this case, each tile is 50x100, and there is a spacing of 10 pixels between
     * consecutive tiles. So `flower` is pixels 0 <= x < 50, 0 <= y < 100, and `grass` is
     * pixels 0 <= x < 50, 110 <= y < 210.
     *
     * @see Sprite
     */
    sprite: function (tile, tileh, url, map, paddingX, paddingY, paddingAroundBorder) {
        var spriteName, temp, x, y, w, h, img;

        //if no tile value, default to 1.
        //(if the first passed argument is a string, it must be the url.)
        if (typeof tile === "string") {
            paddingY = paddingX;
            paddingX = map;
            map = tileh;
            url = tile;
            tile = 1;
            tileh = 1;
        }

        if (typeof tileh == "string") {
            paddingY = paddingX;
            paddingX = map;
            map = url;
            url = tileh;
            tileh = tile;
        }

        //if no paddingY, use paddingX
        if (!paddingY && paddingX) paddingY = paddingX;
        paddingX = parseInt(paddingX || 0, 10); //just incase
        paddingY = parseInt(paddingY || 0, 10);

        var markSpritesReady = function() {
            this.ready = true;
            this.trigger("Invalidate");
        };

        img = Crafty.asset(url);
        if (!img) {
            img = new Image();
            img.src = url;
            Crafty.asset(url, img);
            img.onload = function () {
                //all components with this img are now ready
                for (var spriteName in map) {
                    Crafty(spriteName).each(markSpritesReady);
                }
            };
        }

        var sharedSpriteInit = function() {
            this.requires("2D, Sprite");
            this.__trim = [0, 0, 0, 0];
            this.__image = url;
            this.__coord = [this.__coord[0], this.__coord[1], this.__coord[2], this.__coord[3]];
            this.__tile = tile;
            this.__tileh = tileh;
            this.__padding = [paddingX, paddingY];
            this.__padBorder = paddingAroundBorder;
            this.sprite(this.__coord[0], this.__coord[1], this.__coord[2], this.__coord[3]);
            
            this.img = img;
            //draw now
            if (this.img.complete && this.img.width > 0) {
                this.ready = true;
                this.trigger("Invalidate");
            }

            //set the width and height to the sprite size
            this.w = this.__coord[2];
            this.h = this.__coord[3];
        };

        for (spriteName in map) {
            if (!map.hasOwnProperty(spriteName)) continue;

            temp = map[spriteName];

            //generates sprite components for each tile in the map
            Crafty.c(spriteName, {
                ready: false,
                __coord: [temp[0], temp[1], temp[2] || 1, temp[3] || 1],

                init: sharedSpriteInit
            });
        }

        return this;
    }
});

/**@
 * #Sprite
 * @category Graphics
 * @trigger Invalidate - when the sprites change
 * Component for using tiles in a sprite map.
 */
Crafty.c("Sprite", {
    __image: '',
    /*
     * #.__tile
     * @comp Sprite
     *
     * Horizontal sprite tile size.
     */
    __tile: 0,
    /*
     * #.__tileh
     * @comp Sprite
     *
     * Vertical sprite tile size.
     */
    __tileh: 0,
    __padding: null,
    __trim: null,
    img: null,
    //ready is changed to true in Crafty.sprite
    ready: false,

    init: function () {
        this.__trim = [0, 0, 0, 0];

        var draw = function (e) {
            var co = e.co,
                pos = e.pos,
                context = e.ctx;

            if (e.type === "canvas") {
                //draw the image on the canvas element
                context.drawImage(this.img, //image element
                    co.x, //x position on sprite
                    co.y, //y position on sprite
                    co.w, //width on sprite
                    co.h, //height on sprite
                    pos._x, //x position on canvas
                    pos._y, //y position on canvas
                    pos._w, //width on canvas
                    pos._h //height on canvas
                );
            } else if (e.type === "DOM") {
                // Get scale (ratio of entity dimensions to sprite's dimensions)
                // If needed, we will scale up the entire sprite sheet, and then modify the position accordingly
                var vscale = this._h / co.h,
                    hscale = this._w / co.w,
                    style = this._element.style;

                style.background = style.backgroundColor + " url('" + this.__image + "') no-repeat";
                style.backgroundPosition = "-" + co.x * hscale + "px -" + co.y * vscale + "px";
                // style.backgroundSize must be set AFTER style.background!
                if (vscale != 1 || hscale != 1) {
                    style.backgroundSize = (this.img.width * hscale) + "px" + " " + (this.img.height * vscale) + "px";
                }
            }
        };

        this.bind("Draw", draw).bind("RemoveComponent", function (id) {
            if (id === "Sprite") this.unbind("Draw", draw);
        });
    },

    /**@
     * #.sprite
     * @comp Sprite
     * @sign public this .sprite(Number x, Number y[, Number w, Number h])
     * @param x - X cell position
     * @param y - Y cell position
     * @param w - Width in cells. Optional.
     * @param h - Height in cells. Optional.
     *
     * Uses a new location on the sprite map as its sprite. If w or h are ommitted, the width and height are not changed.
     *
     * Values should be in tiles or cells (not pixels).
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Sprite")
     *   .sprite(0, 0, 2, 2);
     * ~~~
     */

    /**@
     * #.__coord
     * @comp Sprite
     *
     * The coordinate of the slide within the sprite in the format of [x, y, w, h].
     */
    sprite: function (x, y, w, h) {
        this.__coord = this.__coord || [0, 0, 0, 0];

        this.__coord[0] = x * (this.__tile + this.__padding[0]) + (this.__padBorder ? this.__padding[0] : 0) + this.__trim[0];
        this.__coord[1] = y * (this.__tileh + this.__padding[1]) + (this.__padBorder ? this.__padding[1] : 0) + this.__trim[1];
        if (typeof(w)!=='undefined' && typeof(h)!=='undefined') {
            this.__coord[2] = this.__trim[2] || w * this.__tile || this.__tile;
            this.__coord[3] = this.__trim[3] || h * this.__tileh || this.__tileh;
        }

        this.trigger("Invalidate");
        return this;
    },

    /**@
     * #.crop
     * @comp Sprite
     * @sign public this .crop(Number x, Number y, Number w, Number h)
     * @param x - Offset x position
     * @param y - Offset y position
     * @param w - New width
     * @param h - New height
     *
     * If the entity needs to be smaller than the tile size, use this method to crop it.
     *
     * The values should be in pixels rather than tiles.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Sprite")
     *   .crop(40, 40, 22, 23);
     * ~~~
     */
    crop: function (x, y, w, h) {
        var old = this._mbr || this.pos();
        this.__trim = [];
        this.__trim[0] = x;
        this.__trim[1] = y;
        this.__trim[2] = w;
        this.__trim[3] = h;

        this.__coord[0] += x;
        this.__coord[1] += y;
        this.__coord[2] = w;
        this.__coord[3] = h;
        this._w = w;
        this._h = h;

        this.trigger("Invalidate", old);
        return this;
    }
});
},{"./core.js":7}],21:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Storage
 * @category Utilities
 * Very simple way to get and set values, which will persist when the browser is closed also.
 */
/**@
 * #.storage
 * @comp Storage
 * @sign .storage(String key)
 * @param key - a key you would like to get from the storage. It will return null if the key does not exists.
 * @sign .storage(String key, String value)
 * @param key - the key you would like to save the data under.
 * @param value - the value you would like to save.
 * @sign .storage(String key, [Object value, Array value, Boolean value])
 * @param key - the key you would like to save the data under.
 * @param value - the value you would like to save, can be an Object or an Array.
 *
 * Storage function is very simple and can be used to either get or set values. 
 * You can store both booleans, strings, objects and arrays.
 *
 * Please note: You should not store data, while the game is playing, as it can cause the game to slow down. You should load data when you start the game, or when the user for an example click a "Save gameprocess" button.
 *
 * @example
 * Get an already stored value
 * ~~~
 * var playername = Crafty.storage('playername');
 * ~~~
 *
 * @example
 * Save a value
 * ~~~
 * Crafty.storage('playername', 'Hero');
 * ~~~
 *
 * @example
 * Test to see if a value is already there.
 * ~~~
 * var heroname = Crafty.storage('name');
 * if(!heroname){
 *   // Maybe ask the player what their name is here
 *   heroname = 'Guest';
 * }
 * // Do something with heroname
 * ~~~
 */

Crafty.storage = function(key, value){
  var storage = window.localStorage,
      _value = value;

  if(!storage){
    return false;
  }

  if(arguments.length === 1) {
    try {
      return JSON.parse(storage.getItem(key));
    }
    catch (e) {
      return storage.getItem(key);
    }
  } else {
    if(typeof value === "object") {
      _value = JSON.stringify(value);
    }

    storage.setItem(key, _value);
    
  }

};
/**@
 * #.storage.remove
 * @comp Storage
 * @sign .storage.remove(String key)
 * @param key - a key where you will like to delete the value of.
 *
 * Generally you do not need to remove values from localStorage, but if you do
 * store large amount of text, or want to unset something you can do that with
 * this function.
 *
 * @example
 * Get an already stored value
 * ~~~
 * Crafty.storage.remove('playername');
 * ~~~
 *
 */
Crafty.storage.remove = function(key){
  window.localStorage.removeItem(key);
};
},{"./core.js":7}],22:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Text
 * @category Graphics
 * @trigger Invalidate - when the text is changed
 * @requires Canvas or DOM
 * Component to make a text entity.
 *
 * By default, text will have the style "10px sans-serif".
 *
 * Note 1: An entity with the text component is just text! If you want to write text
 * inside an image, you need one entity for the text and another entity for the image.
 * More tips for writing text inside an image: (1) Use the z-index (from 2D component)
 * to ensure that the text is on top of the image, not the other way around; (2)
 * use .attach() (from 2D component) to glue the text to the image so they move and
 * rotate together.
 *
 * Note 2: For DOM (but not canvas) text entities, various font settings (like
 * text-decoration and text-align) can be set using `.css()` (see DOM component). But
 * you cannot use `.css()` to set the properties which are controlled by `.textFont()`
 * or `.textColor()` -- the settings will be ignored.
 *
 * Note 3: If you use canvas text with glyphs that are taller than standard letters, portions of the glyphs might be cut off.
 */
Crafty.c("Text", {
    _text: "",
    defaultSize: "10px",
    defaultFamily: "sans-serif",
    defaultVariant: "normal",
    defaultLineHeight: "normal",
    ready: true,

    init: function () {
        this.requires("2D");
        this._textFont = {
            "type": "",
            "weight": "",
            "size": this.defaultSize,
            "lineHeight":this.defaultLineHeight,
            "family": this.defaultFamily,
            "variant": this.defaultVariant
        };

        this.bind("Draw", function (e) {
            var font = this._fontString();

            if (e.type === "DOM") {
                var el = this._element,
                    style = el.style;

                style.color = this._textColor;
                style.font = font;
                el.innerHTML = this._text;
            } else if (e.type === "canvas") {
                var context = e.ctx;

                context.save();

                context.textBaseline = "top";
                context.fillStyle = this._textColor || "rgb(0,0,0)";
                context.font = font;

                context.fillText(this._text, this._x, this._y);

                context.restore();
            }
        });
    },

    // takes a CSS font-size string and gets the height of the resulting font in px
    _getFontHeight: (function(){
        // regex for grabbing the first string of letters
        var re = /([a-zA-Z]+)\b/;
        // From the CSS spec.  "em" and "ex" are undefined on a canvas.
        var multipliers = {
            "px": 1,
            "pt": 4/3,
            "pc": 16,
            "cm": 96/2.54,
            "mm": 96/25.4,
            "in": 96,
            "em": undefined,
            "ex": undefined
        };
        return function (font){
            var number = parseFloat(font);
            var match = re.exec(font);
            var unit =  match ? match[1] : "px";
            if (multipliers[unit] !== undefined)
                return Math.ceil(number * multipliers[unit]);
            else
                return Math.ceil(number);
        };
    })(),

    /**@
     * #.text
     * @comp Text
     * @sign public this .text(String text)
     * @sign public this .text(Function textgenerator)
     * @param text - String of text that will be inserted into the DOM or Canvas element.
     *
     * This method will update the text inside the entity.
     *
     * If you need to reference attributes on the entity itself you can pass a function instead of a string.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Text").attr({ x: 100, y: 100 }).text("Look at me!!");
     *
     * Crafty.e("2D, DOM, Text").attr({ x: 100, y: 100 })
     *     .text(function () { return "My position is " + this._x });
     *
     * Crafty.e("2D, Canvas, Text").attr({ x: 100, y: 100 }).text("Look at me!!");
     *
     * Crafty.e("2D, Canvas, Text").attr({ x: 100, y: 100 })
     *     .text(function () { return "My position is " + this._x });
     * ~~~
     */
    text: function (text) {
        if (!(typeof text !== "undefined" && text !== null)) return this._text;
        if (typeof (text) == "function")
            this._text = text.call(this);
        else
            this._text = text;

        if (this.has("Canvas") )
            this._resizeForCanvas();

        this.trigger("Invalidate");
        return this;
    },

    // Calculates the height and width of text on the canvas
    // Width is found by using the canvas measureText function
    // Height is only estimated -- it calculates the font size in pixels, and sets the height to 110% of that.
    _resizeForCanvas: function(){
        var ctx = Crafty.canvas.context;
        ctx.font = this._fontString();
        this.w = ctx.measureText(this._text).width;

        var size = (this._textFont.size || this.defaultSize);
        this.h = 1.1 * this._getFontHeight(size);
    },

    // Returns the font string to use
    _fontString: function(){
        return this._textFont.type + ' ' + this._textFont.variant  + ' ' + this._textFont.weight + ' ' + this._textFont.size  + ' / ' + this._textFont.lineHeight + ' ' + this._textFont.family;
    },
    /**@
     * #.textColor
     * @comp Text
     * @sign public this .textColor(String color, Number strength)
     * @param color - The color in hexadecimal
     * @param strength - Level of opacity
     *
     * Modify the text color and level of opacity.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Text").attr({ x: 100, y: 100 }).text("Look at me!!")
     *   .textColor('#FF0000');
     *
     * Crafty.e("2D, Canvas, Text").attr({ x: 100, y: 100 }).text('Look at me!!')
     *   .textColor('#FF0000', 0.6);
     * ~~~
     * @see Crafty.toRGB
     */
    textColor: function (color, strength) {
        this._strength = strength;
        this._textColor = Crafty.toRGB(color, this._strength);
        this.trigger("Invalidate");
        return this;
    },

    /**@
     * #.textFont
     * @comp Text
     * @triggers Invalidate
     * @sign public this .textFont(String key, * value)
     * @param key - Property of the entity to modify
     * @param value - Value to set the property to
     *
     * @sign public this .textFont(Object map)
     * @param map - Object where the key is the property to modify and the value as the property value
     *
     * Use this method to set font property of the text entity.  Possible values are: type, weight, size, family, lineHeight, and variant.
     *
     * When rendered by the canvas, lineHeight and variant will be ignored.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Text").textFont({ type: 'italic', family: 'Arial' });
     * Crafty.e("2D, Canvas, Text").textFont({ size: '20px', weight: 'bold' });
     *
     * Crafty.e("2D, Canvas, Text").textFont("type", "italic");
     * Crafty.e("2D, Canvas, Text").textFont("type"); // italic
     * ~~~
     */
    textFont: function (key, value) {
        if (arguments.length === 1) {
            //if just the key, return the value
            if (typeof key === "string") {
                return this._textFont[key];
            }

            if (typeof key === "object") {
                for (var propertyKey in key) {
                    if(propertyKey == 'family'){
                        this._textFont[propertyKey] = "'" + key[propertyKey] + "'";
                    } else {
                        this._textFont[propertyKey] = key[propertyKey];
                    }
                }
            }
        } else {
            this._textFont[key] = value;
        }

        if (this.has("Canvas") )
            this._resizeForCanvas();

        this.trigger("Invalidate");
        return this;
    },
    /**@
     * #.unselectable
     * @comp Text
     * @triggers Invalidate
     * @sign public this .unselectable()
     *
     * This method sets the text so that it cannot be selected (highlighted) by dragging.
     * (Canvas text can never be highlighted, so this only matters for DOM text.)
     * Works by changing the css property "user-select" and its variants.
     *
     * @example
     * ~~~
     * Crafty.e("2D, DOM, Text").text('This text cannot be highlighted!').unselectable();
     * ~~~
     */
    unselectable: function () {
        // http://stackoverflow.com/questions/826782/css-rule-to-disable-text-selection-highlighting
        if (this.has("DOM")) {
            this.css({
                '-webkit-touch-callout': 'none',
                '-webkit-user-select': 'none',
                '-khtml-user-select': 'none',
                '-moz-user-select': 'none',
                '-ms-user-select': 'none',
                'user-select': 'none'
            });
            this.trigger("Invalidate");
        }
        return this;
    }

});
},{"./core.js":7}],23:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

/**@
 * #Delay
 * @category Utilities
 */
Crafty.c("Delay", {
    init: function () {
        this._delays = [];
        this.bind("EnterFrame", function () {
            var now = new Date().getTime();
            var index = this._delays.length;
            while (--index >= 0) {
                var item = this._delays[index];
                if (item.start + item.delay + item.pause < now) {
                    item.func.call(this);
                    if (item.repeat > 0) {
                        // reschedule item
                        item.start = now;
                        item.pause = 0;
                        item.pauseBuffer = 0;
                        item.repeat--;
                    } else if (item.repeat <= 0) {
                        // remove item from array
                        this._delays.splice(index, 1);
                    }
                }
            }
        });
        this.bind("Pause", function () {
            var now = new Date().getTime();
            for (var index in this._delays) {
                this._delays[index].pauseBuffer = now;
            }
        });
        this.bind("Unpause", function () {
            var now = new Date().getTime();
            for (var index in this._delays) {
                var item = this._delays[index];
                item.pause += now - item.pauseBuffer;
            }
        });
    },
    /**@
     * #.delay
     * @comp Delay
     * @sign public this.delay(Function callback, Number delay)
     * @param callback - Method to execute after given amount of milliseconds
     * @param delay - Amount of milliseconds to execute the method
     * @param repeat - How often to repeat the delayed function. A value of 0 triggers the delayed
     * function exactly once. A value n > 0 triggers the delayed function exactly n+1 times. A
     * value of -1 triggers the delayed function indefinitely.
     *
     * The delay method will execute a function after a given amount of time in milliseconds.
     *
     * It is not a wrapper for `setTimeout`.
     *
     * If Crafty is paused, the delay is interrupted with the pause and then resume when unpaused
     *
     * If the entity is destroyed, the delay is also destroyed and will not have effect.
     *
     * @example
     * ~~~
     * console.log("start");
     * Crafty.e("Delay").delay(function() {
     *   console.log("100ms later");
     * }, 100, 0);
     * ~~~
     */
    delay: function (func, delay, repeat) {
        this._delays.push({
            start: new Date().getTime(),
            func: func,
            delay: delay,
            repeat: (repeat < 0 ? Infinity : repeat) || 0,
            pauseBuffer: 0,
            pause: 0
        });
        return this;
    }
});
},{"./core.js":7}],24:[function(require,module,exports){
module.exports = "0.6.1";
},{}],25:[function(require,module,exports){
var Crafty = require('./core.js'),
    document = window.document;

Crafty.extend({
    /**@
     * #Crafty.viewport
     * @category Stage
     * @trigger ViewportScroll - when the viewport's x or y coordinates change
     * @trigger ViewportScale - when the viewport's scale changes
     * @trigger ViewportResize - when the viewport's dimension's change
     * @trigger InvalidateViewport - when the viewport changes
     * @trigger StopCamera - when any camera animations should stop, such as at the start of a new animation.
     * @trigger CameraAnimationDone - when a camera animation comes reaches completion
     *
     * Viewport is essentially a 2D camera looking at the stage. Can be moved which
     * in turn will react just like a camera moving in that direction.
     */
    viewport: {
        /**@
         * #Crafty.viewport.clampToEntities
         * @comp Crafty.viewport
         *
         * Decides if the viewport functions should clamp to game entities.
         * When set to `true` functions such as Crafty.viewport.mouselook() will not allow you to move the
         * viewport over areas of the game that has no entities.
         * For development it can be useful to set this to false.
         */
        clampToEntities: true,
        _width: 0,
        _height: 0,
        /**@
         * #Crafty.viewport.x
         * @comp Crafty.viewport
         *
         * Will move the stage and therefore every visible entity along the `x`
         * axis in the opposite direction.
         *
         * When this value is set, it will shift the entire stage. This means that entity
         * positions are not exactly where they are on screen. To get the exact position,
         * simply add `Crafty.viewport.x` onto the entities `x` position.
         */
        _x: 0,
        /**@
         * #Crafty.viewport.y
         * @comp Crafty.viewport
         *
         * Will move the stage and therefore every visible entity along the `y`
         * axis in the opposite direction.
         *
         * When this value is set, it will shift the entire stage. This means that entity
         * positions are not exactly where they are on screen. To get the exact position,
         * simply add `Crafty.viewport.y` onto the entities `y` position.
         */
        _y: 0,

        /**@
         * #Crafty.viewport._scale
         * @comp Crafty.viewport
         *
         * What scale to render the viewport at.  This does not alter the size of the stage itself, but the magnification of what it shows.
         */

        _scale: 1,

        /**@
         * #Crafty.viewport.bounds
         * @comp Crafty.viewport
         *
         * A rectangle which defines the bounds of the viewport.
         * It should be an object with two properties, `max` and `min`,
         * which are each an object with `x` and `y` properties.
         *
         * If this property is null, Crafty uses the bounding box of all the items
         * on the stage.  This is the initial value.  (To prevent this behavior, set `Crafty.viewport.clampToEntities` to `false`)
         *
         * If you wish to bound the viewport along one axis but not the other, you can use `-Infinity` and `+Infinity` as bounds.
         *
         * @see Crafty.viewport.clampToEntities
         *
         * @example
         * Set the bounds to a 500 by 500 square:
         *
         * ~~~
         * Crafty.viewport.bounds = {min:{x:0, y:0}, max:{x:500, y:500}};
         * ~~~
         */
        bounds: null,

        /**@
         * #Crafty.viewport.scroll
         * @comp Crafty.viewport
         * @sign Crafty.viewport.scroll(String axis, Number val)
         * @param axis - 'x' or 'y'
         * @param val - The new absolute position on the axis
         *
         * Will move the viewport to the position given on the specified axis
         *
         * @example
         * Will move the camera 500 pixels right of its initial position, in effect
         * shifting everything in the viewport 500 pixels to the left.
         *
         * ~~~
         * Crafty.viewport.scroll('_x', 500);
         * ~~~
         */
        scroll: function (axis, val) {
            this[axis] = val;
            Crafty.trigger("ViewportScroll");
            Crafty.trigger("InvalidateViewport");
        },

        rect: function () {
            return {
                _x: -this._x,
                _y: -this._y,
                _w: this.width / this._scale,
                _h: this.height / this._scale
            };
        },

        /**@ 

         * #Crafty.viewport.pan
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.pan(String axis, Number v, Number time)
         * @param String axis - 'x' or 'y'. The axis to move the camera on
         * @param Number v - the distance to move the camera by
         * @param Number time - The duration in ms for the entire camera movement
         *
         * Pans the camera a given number of pixels over the specified time
         */
        pan: (function () {
            var tweens = {}, i, bound = false;
            var targetX, targetY, startingX, startingY, easing;

            function enterFrame(e) {
                easing.tick(e.dt);
                var v = easing.value();
                Crafty.viewport.x = (1-v) * startingX + v * targetX;
                Crafty.viewport.y = (1-v) * startingY + v * targetY;
                Crafty.viewport._clamp();

                if (easing.complete){
                    stopPan();
                    Crafty.trigger("CameraAnimationDone");
                }
            }

            function stopPan(){
                Crafty.unbind("EnterFrame", enterFrame);
            }

            Crafty.bind("StopCamera", stopPan);

            return function (dx, dy, time) {
                // Cancel any current camera control
                Crafty.trigger("StopCamera");

                // Handle request to reset
                if (dx == 'reset') {
                   return;
                }

                startingX = Crafty.viewport._x;
                startingY = Crafty.viewport._y;
                targetX = startingX - dx;
                targetY = startingY - dy;

                easing = new Crafty.easing(time);

                // bind to event, using uniqueBind prevents multiple copies from being bound
                Crafty.uniqueBind("EnterFrame", enterFrame);
                       
            };
        })(),

        /**@
         * #Crafty.viewport.follow
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.follow(Object target, Number offsetx, Number offsety)
         * @param Object target - An entity with the 2D component
         * @param Number offsetx - Follow target should be offsetx pixels away from center
         * @param Number offsety - Positive puts target to the right of center
         *
         * Follows a given entity with the 2D component. If following target will take a portion of
         * the viewport out of bounds of the world, following will stop until the target moves away.
         *
         * @example
         * ~~~
         * var ent = Crafty.e('2D, DOM').attr({w: 100, h: 100:});
         * Crafty.viewport.follow(ent, 0, 0);
         * ~~~
         */
        follow: (function () {
            var oldTarget, offx, offy;

            function change() {
                Crafty.viewport.scroll('_x', -(this.x + (this.w / 2) - (Crafty.viewport.width / 2) - offx));
                Crafty.viewport.scroll('_y', -(this.y + (this.h / 2) - (Crafty.viewport.height / 2) - offy));
                Crafty.viewport._clamp();
            }

            function stopFollow(){
                if (oldTarget)
                    oldTarget.unbind('Move', change);
            }

            Crafty.bind("StopCamera", stopFollow);

            return function (target, offsetx, offsety) {
                if (!target || !target.has('2D'))
                    return;
                Crafty.trigger("StopCamera");

                oldTarget = target;
                offx = (typeof offsetx != 'undefined') ? offsetx : 0;
                offy = (typeof offsety != 'undefined') ? offsety : 0;

                target.bind('Move', change);
                change.call(target);
            };
        })(),

        /**@
         * #Crafty.viewport.centerOn
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.centerOn(Object target, Number time)
         * @param Object target - An entity with the 2D component
         * @param Number time - The duration in ms of the camera motion
         *
         * Centers the viewport on the given entity.
         */
        centerOn: function (targ, time) {
            var x = targ.x + Crafty.viewport.x,
                y = targ.y + Crafty.viewport.y,
                mid_x = targ.w / 2,
                mid_y = targ.h / 2,
                cent_x = Crafty.viewport.width / 2,
                cent_y = Crafty.viewport.height / 2,
                new_x = x + mid_x - cent_x,
                new_y = y + mid_y - cent_y;

            Crafty.viewport.pan(new_x, new_y, time);
        },
        /**@
         * #Crafty.viewport._zoom
         * @comp Crafty.viewport
         *
         * This value keeps an amount of viewport zoom, required for calculating mouse position at entity
         */
        _zoom: 1,

        /**@
         * #Crafty.viewport.zoom
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.zoom(Number amt, Number cent_x, Number cent_y, Number time)
         * @param Number amt - amount to zoom in on the target by (eg. 2, 4, 0.5)
         * @param Number cent_x - the center to zoom on
         * @param Number cent_y - the center to zoom on
         * @param Number time - the duration in ms of the entire zoom operation
         *
         * Zooms the camera in on a given point. amt > 1 will bring the camera closer to the subject
         * amt < 1 will bring it farther away. amt = 0 will reset to the default zoom level
         * Zooming is multiplicative. To reset the zoom amount, pass 0.
         */
        zoom: (function () {
            

            function stopZoom(){
                Crafty.unbind("EnterFrame", enterFrame);
            }
            Crafty.bind("StopCamera", stopZoom);

            var startingZoom, finalZoom, finalAmount, startingX, finalX, startingY, finalY, easing;

            function enterFrame(e){
                var amount, v;

                easing.tick(e.dt);

                // The scaling should happen smoothly -- start at 1, end at finalAmount, and at half way scaling should be by finalAmount^(1/2)
                // Since value goes smoothly from 0 to 1, this fufills those requirements
                amount = Math.pow(finalAmount, easing.value() );

                // The viewport should move in such a way that no point reverses
                // If a and b are the top left/bottom right of the viewport, then the below can be derived from
                //      (a_0-b_0)/(a-b) = amount,
                // and the assumption that both a and b have the same form
                //      a = a_0 * (1-v) + a_f * v,
                //      b = b_0 * (1-v) + b_f * v.
                // This is just an arbitrary parameterization of the only sensible path for the viewport corners to take.
                // And by symmetry they should be parameterized in the same way!  So not much choice here.
                if (finalAmount === 1)
                    v = easing.value();  // prevent NaN!  If zoom is used this way, it'll just become a pan.
                else
                    v = (1/amount - 1 ) / (1/finalAmount - 1);

                // Set new scale and viewport position
                Crafty.viewport.scale( amount * startingZoom );
                Crafty.viewport.scroll("_x", startingX * (1-v) + finalX * v );
                Crafty.viewport.scroll("_y", startingY * (1-v) + finalY * v );
                Crafty.viewport._clamp();

                if (easing.complete){
                    stopZoom();
                    Crafty.trigger("CameraAnimationDone");
                }


            }

            return function (amt, cent_x, cent_y, time){
                if (!amt) { // we're resetting to defaults
                    Crafty.viewport.scale(1);
                    return;
                }

                if (arguments.length <= 2) {
                    time = cent_x;
                    cent_x = Crafty.viewport.x - Crafty.viewport.width;
                    cent_y = Crafty.viewport.y - Crafty.viewport.height;
                }

                Crafty.trigger("StopCamera");
                startingZoom = Crafty.viewport._zoom;
                finalAmount = amt;
                finalZoom = startingZoom * finalAmount;
                

                startingX = Crafty.viewport.x;
                startingY = Crafty.viewport.y;
                finalX = - (cent_x - Crafty.viewport.width  / (2 * finalZoom) );
                finalY = - (cent_y - Crafty.viewport.height / (2 * finalZoom) );

                easing = new Crafty.easing(time);

                Crafty.uniqueBind("EnterFrame", enterFrame);
            };

            
        })(),
        /**@
         * #Crafty.viewport.scale
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.scale(Number amt)
         * @param Number amt - amount to zoom/scale in on the element on the viewport by (eg. 2, 4, 0.5)
         *
         * Adjusts the. amt > 1 increase all entities on stage
         * amt < 1 will reduce all entities on stage. amt = 0 will reset the zoom/scale.
         * To reset the scale amount, pass 0.
         *
         * This method sets the absolute scale, while `Crafty.viewport.zoom` sets the scale relative to the existing value.
         * @see Crafty.viewport.zoom
         *
         * @example
         * ~~~
         * Crafty.viewport.scale(2); //to see effect add some entities on stage.
         * ~~~
         */
        scale: (function () {
            return function (amt) {
                var final_zoom = amt ? amt : 1;

                this._zoom = final_zoom;
                this._scale = final_zoom;
                Crafty.trigger("InvalidateViewport");
                Crafty.trigger("ViewportScale");

            };
        })(),
        /**@
         * #Crafty.viewport.mouselook
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.mouselook(Boolean active)
         * @param Boolean active - Activate or deactivate mouselook
         *
         * Toggle mouselook on the current viewport.
         * Simply call this function and the user will be able to
         * drag the viewport around.
         *
         * If the user starts a drag, "StopCamera" will be triggered, which will cancel any existing camera animations.
         */
        mouselook: (function () {
            var active = false,
                dragging = false,
                lastMouse = {};
            old = {};
            function stopLook(){
                dragging = false;
            }


            return function (op, arg) {
                if (typeof op == 'boolean') {
                    active = op;
                    if (active) {
                        Crafty.mouseObjs++;
                    } else {
                        Crafty.mouseObjs = Math.max(0, Crafty.mouseObjs - 1);
                    }
                    return;
                }
                if (!active) return;
                switch (op) {
                case 'move':
                case 'drag':
                    if (!dragging) return;
                    diff = {
                        x: arg.clientX - lastMouse.x,
                        y: arg.clientY - lastMouse.y
                    };

                    lastMouse.x = arg.clientX;
                    lastMouse.y = arg.clientY;

                    Crafty.viewport.x += diff.x;
                    Crafty.viewport.y += diff.y;
                    Crafty.viewport._clamp();
                    break;
                case 'start':
                    Crafty.trigger("StopCamera");
                    lastMouse.x = arg.clientX;
                    lastMouse.y = arg.clientY;
                    dragging = true;
                    break;
                case 'stop':
                    dragging = false;
                    break;
                }
            };
        })(),
        _clamp: function () {
            // clamps the viewport to the viewable area
            // under no circumstances should the viewport see something outside the boundary of the 'world'
            if (!this.clampToEntities) return;
            var bound = this.bounds || Crafty.map.boundaries();
            bound.max.x *= this._zoom;
            bound.min.x *= this._zoom;
            bound.max.y *= this._zoom;
            bound.min.y *= this._zoom;
            if (bound.max.x - bound.min.x > Crafty.viewport.width) {
                if (Crafty.viewport.x < -bound.max.x + Crafty.viewport.width) {
                    Crafty.viewport.x = -bound.max.x + Crafty.viewport.width;
                } else if (Crafty.viewport.x > -bound.min.x) {
                    Crafty.viewport.x = -bound.min.x;
                }
            } else {
                Crafty.viewport.x = -1 * (bound.min.x + (bound.max.x - bound.min.x) / 2 - Crafty.viewport.width / 2);
            }
            if (bound.max.y - bound.min.y > Crafty.viewport.height) {
                if (Crafty.viewport.y < -bound.max.y + Crafty.viewport.height) {
                    Crafty.viewport.y = -bound.max.y + Crafty.viewport.height;
                } else if (Crafty.viewport.y > -bound.min.y) {
                    Crafty.viewport.y = -bound.min.y;
                }
            } else {
                Crafty.viewport.y = -1 * (bound.min.y + (bound.max.y - bound.min.y) / 2 - Crafty.viewport.height / 2);
            }
        },

        /**@
         * #Crafty.viewport.init
         * @comp Crafty.viewport
         * @sign public void Crafty.viewport.init([Number width, Number height, String stage_elem])
         * @sign public void Crafty.viewport.init([Number width, Number height, HTMLElement stage_elem])
         * @param Number width - Width of the viewport
         * @param Number height - Height of the viewport
         * @param String or HTMLElement stage_elem - the element to use as the stage (either its id or the actual element).
         *
         * Initialize the viewport. If the arguments 'width' or 'height' are missing, use Crafty.DOM.window.width and Crafty.DOM.window.height (full screen model).
         *
         * The argument 'stage_elem' is used to specify a stage element other than the default, and can be either a string or an HTMLElement.  If a string is provided, it will look for an element with that id and, if none exists, create a div.  If an HTMLElement is provided, that is used directly.  Omitting this argument is the same as passing an id of 'cr-stage'.
         *
         * @see Crafty.device, Crafty.DOM, Crafty.stage
         */
        init: function (w, h) {

            // setters+getters for the viewport
            this._defineViewportProperties();
            // If no width or height is defined, the width and height is set to fullscreen
            this._width = (!w) ? Crafty.DOM.window.width : w;
            this._height = (!h) ? Crafty.DOM.window.height : h;



            /**@
             * #Crafty.stage
             * @category Core
             * The stage where all the DOM entities will be placed.
             */

            /**@
             * #Crafty.stage.elem
             * @comp Crafty.stage
             * The `#cr-stage` div element.
             */

            /**@
             * #Crafty.stage.inner
             * @comp Crafty.stage
             * `Crafty.stage.inner` is a div inside the `#cr-stage` div that holds all DOM entities.
             * If you use canvas, a `canvas` element is created at the same level in the dom
             * as the the `Crafty.stage.inner` div. So the hierarchy in the DOM is
             *  
             * ~~~
             * Crafty.stage.elem
             *  - Crafty.stage.inner (a div HTMLElement)
             *  - Crafty.canvas._canvas (a canvas HTMLElement)
             * ~~~
             */

             var c;
             c = document.createElement("canvas");
             c.width = Crafty.viewport.width;
             c.height = Crafty.viewport.height;

             Crafty.canvas._canvas = c;
             Crafty.canvas.context = c.getContext('2d');
             document.body.appendChild(c);

            //create stage div to contain everything
            Crafty.stage = {
                x: 0,
                y: 0,
                fullscreen: false,
                elem: c
            };

            //fullscreen, stop scrollbars
            if (!w && !h) {
                document.body.style.overflow = "hidden";
                Crafty.stage.fullscreen = true;
            }

            Crafty.addEvent(this, window, "resize", Crafty.viewport.reload);

            // Crafty.addEvent(this, window, "blur", function () {
            //     if (Crafty.settings.get("autoPause")) {
            //         if (!Crafty._paused) Crafty.pause();
            //     }
            // });
            // Crafty.addEvent(this, window, "focus", function () {
            //     if (Crafty._paused && Crafty.settings.get("autoPause")) {
            //         Crafty.pause();
            //     }
            // });


            Crafty.settings.register("autoPause", function () {});
            Crafty.settings.modify("autoPause", false);


            // Crafty.stage.elem.appendChild(Crafty.stage.inner);
            // Crafty.stage.inner.style.position = "absolute";
            // Crafty.stage.inner.style.zIndex = "1";
            // Crafty.stage.inner.style.transformStyle = "preserve-3d"; // Seems necessary for Firefox to preserve zIndexes?

            //css style
            // elem.width = this.width + "px";
            // elem.height = this.height + "px";
            // elem.overflow = "hidden";


            // resize events
            Crafty.bind("ViewportResize", function(){Crafty.trigger("InvalidateViewport");});

            if (Crafty.mobile) {

                // remove default gray highlighting after touch



            } else {
                // elem.position = "relative";
                // //find out the offset position of the stage
                // offset = Crafty.DOM.inner(Crafty.stage.elem);
                // Crafty.stage.x = offset.x;
                // Crafty.stage.y = offset.y;
            }

            
        },

        // Create setters/getters for x, y, width, height
        _defineViewportProperties: function(){
            if (Crafty.support.setter) {
                //define getters and setters to scroll the viewport
                this.__defineSetter__('x', function (v) {
                    this.scroll('_x', v);
                });
                this.__defineSetter__('y', function (v) {
                    this.scroll('_y', v);
                });
                this.__defineSetter__('width', function (v) {
                    this._width = v;
                    Crafty.trigger("ViewportResize");
                });
                this.__defineSetter__('height', function (v) {
                    this._height = v;
                    Crafty.trigger("ViewportResize");
                });
                this.__defineGetter__('x', function () {
                    return this._x;
                });
                this.__defineGetter__('y', function () {
                    return this._y;
                });
                this.__defineGetter__('width', function () {
                    return this._width;
                });
                this.__defineGetter__('height', function () {
                    return this._height;
                });



                //IE9
            } else if (Crafty.support.defineProperty) {
                Object.defineProperty(this, 'x', {
                    set: function (v) {
                        this.scroll('_x', v);
                    },
                    get: function () {
                        return this._x;
                    },
                    configurable : true
                });
                Object.defineProperty(this, 'y', {
                    set: function (v) {
                        this.scroll('_y', v);
                    },
                    get: function () {
                        return this._y;
                    },
                    configurable : true
                });
                Object.defineProperty(this, 'width', {
                    set: function (v) {
                        this._width = v;
                        Crafty.trigger("ViewportResize");
                    },
                    get: function () {
                        return this._width;
                    },
                    configurable : true
                });
                Object.defineProperty(this, 'height', {
                    set: function (v) {
                        this._height = v;
                        Crafty.trigger("ViewportResize");
                    },
                    get: function () {
                        return this._height;
                    },
                    configurable : true
                });
            }
        },

        /**@
         * #Crafty.viewport.reload
         * @comp Crafty.stage
         *
         * @sign public Crafty.viewport.reload()
         *
         * Recalculate and reload stage width, height and position.
         * Useful when browser return wrong results on init (like safari on Ipad2).
         *
         */
        reload: function () {
            Crafty.DOM.window.init();
            var w = Crafty.DOM.window.width,
                h = Crafty.DOM.window.height,
                offset;


            if (Crafty.stage.fullscreen) {
                this._width = w;
                this._height = h;
                Crafty.trigger("ViewportResize");
            }

            // offset = Crafty.DOM.inner(Crafty.stage.elem);
            // Crafty.stage.x = offset.x;
            // Crafty.stage.y = offset.y;
        },

        /**@
         * #Crafty.viewport.reset
         * @comp Crafty.stage
         * @trigger StopCamera - called to cancel camera animations
         *
         * @sign public Crafty.viewport.reset()
         *
         * Resets the viewport to starting values, and cancels any existing camera animations.
         * Called when scene() is run.
         */
        reset: function () {
            Crafty.viewport.mouselook("stop");
            Crafty.trigger("StopCamera");
            Crafty.viewport.scale(1);
        }
    }
});

},{"./core.js":7}]},{},[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy8yRC5qcyIsIi9Vc2Vycy9rZXZpbnNpbXBlci9Qcm9qZWN0cy9DcmFmdHkva2V2aW4vc3JjL0hhc2hNYXAuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9hbmltYXRpb24uanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9jYW52YXMuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9jb2xsaXNpb24uanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9jb250cm9scy5qcyIsIi9Vc2Vycy9rZXZpbnNpbXBlci9Qcm9qZWN0cy9DcmFmdHkva2V2aW4vc3JjL2NvcmUuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9kZXZpY2UuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9kaWFtb25kaXNvLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvZHJhd2luZy5qcyIsIi9Vc2Vycy9rZXZpbnNpbXBlci9Qcm9qZWN0cy9DcmFmdHkva2V2aW4vc3JjL2V4dGVuc2lvbnMuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9odG1sLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvaW1wb3J0LmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvaXNvbWV0cmljLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMva2V5Y29kZXMuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9sb2FkZXIuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9tYXRoLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvc2NlbmVzLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvc291bmQuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9zcHJpdGUuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy9zdG9yYWdlLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvdGV4dC5qcyIsIi9Vc2Vycy9rZXZpbnNpbXBlci9Qcm9qZWN0cy9DcmFmdHkva2V2aW4vc3JjL3RpbWUuanMiLCIvVXNlcnMva2V2aW5zaW1wZXIvUHJvamVjdHMvQ3JhZnR5L2tldmluL3NyYy92ZXJzaW9uLmpzIiwiL1VzZXJzL2tldmluc2ltcGVyL1Byb2plY3RzL0NyYWZ0eS9rZXZpbi9zcmMvdmlld3BvcnQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaDFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdldBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdnFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ROQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4NkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcmlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BnQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudCxcbiAgICBIYXNoTWFwID0gcmVxdWlyZSgnLi9IYXNoTWFwLmpzJyk7XG4vLyBDcmFmdHkuX3JlY3RQb29sXG4vL1xuLy8gVGhpcyBpcyBhIHByaXZhdGUgb2JqZWN0IHVzZWQgaW50ZXJuYWxseSBieSAyRCBtZXRob2RzXG4vLyBDYXNjYWRlIGFuZCBfYXR0ciBuZWVkIHRvIGtlZXAgdHJhY2sgb2YgYW4gZW50aXR5J3Mgb2xkIHBvc2l0aW9uLFxuLy8gYnV0IHdlIHdhbnQgdG8gYXZvaWQgY3JlYXRpbmcgdGVtcCBvYmplY3RzIGV2ZXJ5IHRpbWUgYW4gYXR0cmlidXRlIGlzIHNldC5cbi8vIFRoZSBzb2x1dGlvbiBpcyB0byBoYXZlIGEgcG9vbCBvZiBvYmplY3RzIHRoYXQgY2FuIGJlIHJldXNlZC5cbi8vXG4vLyBUaGUgY3VycmVudCBpbXBsZW1lbnRhdGlvbiBtYWtlcyBhIEJJRyBBU1NVTVBUSU9OOiAgdGhhdCBpZiBtdWx0aXBsZSByZWN0YW5nbGVzIGFyZSByZXF1ZXN0ZWQsXG4vLyB0aGUgbGF0ZXIgb25lIGlzIHJlY3ljbGVkIGJlZm9yZSBhbnkgcHJlY2VkaW5nIG9uZXMuICBUaGlzIG1hdGNoZXMgaG93IHRoZXkgYXJlIHVzZWQgaW4gdGhlIGNvZGUuXG4vLyBFYWNoIHJlY3QgaXMgY3JlYXRlZCBieSBhIHRyaWdnZXJlZCBldmVudCwgYW5kIHdpbGwgYmUgcmVjeWNsZWQgYnkgdGhlIHRpbWUgdGhlIGV2ZW50IGlzIGNvbXBsZXRlLlxuQ3JhZnR5Ll9yZWN0UG9vbCA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBvb2wgPSBbXSxcbiAgICAgICAgcG9pbnRlciA9IDA7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgICAgICAgaWYgKHBvb2wubGVuZ3RoIDw9IHBvaW50ZXIpXG4gICAgICAgICAgICAgICAgcG9vbC5wdXNoKHt9KTtcbiAgICAgICAgICAgIHZhciByID0gcG9vbFtwb2ludGVyKytdO1xuICAgICAgICAgICAgci5feCA9IHg7XG4gICAgICAgICAgICByLl95ID0geTtcbiAgICAgICAgICAgIHIuX3cgPSB3O1xuICAgICAgICAgICAgci5faCA9IGg7XG4gICAgICAgICAgICByZXR1cm4gcjtcbiAgICAgICAgfSxcblxuICAgICAgICBjb3B5OiBmdW5jdGlvbiAobykge1xuICAgICAgICAgICAgaWYgKHBvb2wubGVuZ3RoIDw9IHBvaW50ZXIpXG4gICAgICAgICAgICAgICAgcG9vbC5wdXNoKHt9KTtcbiAgICAgICAgICAgIHZhciByID0gcG9vbFtwb2ludGVyKytdO1xuICAgICAgICAgICAgci5feCA9IG8uX3g7XG4gICAgICAgICAgICByLl95ID0gby5feTtcbiAgICAgICAgICAgIHIuX3cgPSBvLl93O1xuICAgICAgICAgICAgci5faCA9IG8uX2g7XG4gICAgICAgICAgICByZXR1cm4gcjtcbiAgICAgICAgfSxcblxuICAgICAgICByZWN5Y2xlOiBmdW5jdGlvbiAobykge1xuICAgICAgICAgICAgcG9pbnRlci0tO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cblxuLyoqQFxuICogI0NyYWZ0eS5tYXBcbiAqIEBjYXRlZ29yeSAyRFxuICogRnVuY3Rpb25zIHJlbGF0ZWQgd2l0aCBxdWVyeWluZyBlbnRpdGllcy5cbiAqIEBzZWUgQ3JhZnR5Lkhhc2hNYXBcbiAqL1xuQ3JhZnR5Lm1hcCA9IG5ldyBIYXNoTWFwKCk7XG52YXIgTSA9IE1hdGgsXG4gICAgTWMgPSBNLmNvcyxcbiAgICBNcyA9IE0uc2luLFxuICAgIFBJID0gTS5QSSxcbiAgICBERUdfVE9fUkFEID0gUEkgLyAxODA7XG5cbkNyYWZ0eS5leHRlbmQoe1xuICAgIHplcm9GaWxsOiBmdW5jdGlvbiAobnVtYmVyLCB3aWR0aCkge1xuICAgICAgICB3aWR0aCAtPSBudW1iZXIudG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICAgIGlmICh3aWR0aCA+IDApXG4gICAgICAgICAgICByZXR1cm4gbmV3IEFycmF5KHdpZHRoICsgKC9cXC4vLnRlc3QobnVtYmVyKSA/IDIgOiAxKSkuam9pbignMCcpICsgbnVtYmVyO1xuICAgICAgICByZXR1cm4gbnVtYmVyLnRvU3RyaW5nKCk7XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICMyRFxuICogQGNhdGVnb3J5IDJEXG4gKiBDb21wb25lbnQgZm9yIGFueSBlbnRpdHkgdGhhdCBoYXMgYSBwb3NpdGlvbiBvbiB0aGUgc3RhZ2UuXG4gKiBAdHJpZ2dlciBNb3ZlIC0gd2hlbiB0aGUgZW50aXR5IGhhcyBtb3ZlZCAtIHsgX3g6TnVtYmVyLCBfeTpOdW1iZXIsIF93Ok51bWJlciwgX2g6TnVtYmVyIH0gLSBPbGQgcG9zaXRpb25cbiAqIEB0cmlnZ2VyIEludmFsaWRhdGUgLSB3aGVuIHRoZSBlbnRpdHkgbmVlZHMgdG8gYmUgcmVkcmF3blxuICogQHRyaWdnZXIgUm90YXRlIC0gd2hlbiB0aGUgZW50aXR5IGlzIHJvdGF0ZWQgLSB7IGNvczpOdW1iZXIsIHNpbjpOdW1iZXIsIGRlZzpOdW1iZXIsIHJhZDpOdW1iZXIsIG86IHt4Ok51bWJlciwgeTpOdW1iZXJ9fVxuICovXG5DcmFmdHkuYyhcIjJEXCIsIHtcbiAgICAvKipAXG4gICAgICogIy54XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBUaGUgYHhgIHBvc2l0aW9uIG9uIHRoZSBzdGFnZS4gV2hlbiBtb2RpZmllZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGJlIHJlZHJhd24uXG4gICAgICogSXMgYWN0dWFsbHkgYSBnZXR0ZXIvc2V0dGVyIHNvIHdoZW4gdXNpbmcgdGhpcyB2YWx1ZSBmb3IgY2FsY3VsYXRpb25zIGFuZCBub3QgbW9kaWZ5aW5nIGl0LFxuICAgICAqIHVzZSB0aGUgYC5feGAgcHJvcGVydHkuXG4gICAgICogQHNlZSAuX2F0dHJcbiAgICAgKi9cbiAgICBfeDogMCxcbiAgICAvKipAXG4gICAgICogIy55XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBUaGUgYHlgIHBvc2l0aW9uIG9uIHRoZSBzdGFnZS4gV2hlbiBtb2RpZmllZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGJlIHJlZHJhd24uXG4gICAgICogSXMgYWN0dWFsbHkgYSBnZXR0ZXIvc2V0dGVyIHNvIHdoZW4gdXNpbmcgdGhpcyB2YWx1ZSBmb3IgY2FsY3VsYXRpb25zIGFuZCBub3QgbW9kaWZ5aW5nIGl0LFxuICAgICAqIHVzZSB0aGUgYC5feWAgcHJvcGVydHkuXG4gICAgICogQHNlZSAuX2F0dHJcbiAgICAgKi9cbiAgICBfeTogMCxcbiAgICAvKipAXG4gICAgICogIy53XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBUaGUgd2lkdGggb2YgdGhlIGVudGl0eS4gV2hlbiBtb2RpZmllZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGJlIHJlZHJhd24uXG4gICAgICogSXMgYWN0dWFsbHkgYSBnZXR0ZXIvc2V0dGVyIHNvIHdoZW4gdXNpbmcgdGhpcyB2YWx1ZSBmb3IgY2FsY3VsYXRpb25zIGFuZCBub3QgbW9kaWZ5aW5nIGl0LFxuICAgICAqIHVzZSB0aGUgYC5fd2AgcHJvcGVydHkuXG4gICAgICpcbiAgICAgKiBDaGFuZ2luZyB0aGlzIHZhbHVlIGlzIG5vdCByZWNvbW1lbmRlZCBhcyBjYW52YXMgaGFzIHRlcnJpYmxlIHJlc2l6ZSBxdWFsaXR5IGFuZCBET00gd2lsbCBqdXN0IGNsaXAgdGhlIGltYWdlLlxuICAgICAqIEBzZWUgLl9hdHRyXG4gICAgICovXG4gICAgX3c6IDAsXG4gICAgLyoqQFxuICAgICAqICMuaFxuICAgICAqIEBjb21wIDJEXG4gICAgICogVGhlIGhlaWdodCBvZiB0aGUgZW50aXR5LiBXaGVuIG1vZGlmaWVkLCB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgcmVkcmF3bi5cbiAgICAgKiBJcyBhY3R1YWxseSBhIGdldHRlci9zZXR0ZXIgc28gd2hlbiB1c2luZyB0aGlzIHZhbHVlIGZvciBjYWxjdWxhdGlvbnMgYW5kIG5vdCBtb2RpZnlpbmcgaXQsXG4gICAgICogdXNlIHRoZSBgLl9oYCBwcm9wZXJ0eS5cbiAgICAgKlxuICAgICAqIENoYW5naW5nIHRoaXMgdmFsdWUgaXMgbm90IHJlY29tbWVuZGVkIGFzIGNhbnZhcyBoYXMgdGVycmlibGUgcmVzaXplIHF1YWxpdHkgYW5kIERPTSB3aWxsIGp1c3QgY2xpcCB0aGUgaW1hZ2UuXG4gICAgICogQHNlZSAuX2F0dHJcbiAgICAgKi9cbiAgICBfaDogMCxcbiAgICAvKipAXG4gICAgICogIy56XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBUaGUgYHpgIGluZGV4IG9uIHRoZSBzdGFnZS4gV2hlbiBtb2RpZmllZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGJlIHJlZHJhd24uXG4gICAgICogSXMgYWN0dWFsbHkgYSBnZXR0ZXIvc2V0dGVyIHNvIHdoZW4gdXNpbmcgdGhpcyB2YWx1ZSBmb3IgY2FsY3VsYXRpb25zIGFuZCBub3QgbW9kaWZ5aW5nIGl0LFxuICAgICAqIHVzZSB0aGUgYC5femAgcHJvcGVydHkuXG4gICAgICpcbiAgICAgKiBBIGhpZ2hlciBgemAgdmFsdWUgd2lsbCBiZSBjbG9zZXIgdG8gdGhlIGZyb250IG9mIHRoZSBzdGFnZS4gQSBzbWFsbGVyIGB6YCB2YWx1ZSB3aWxsIGJlIGNsb3NlciB0byB0aGUgYmFjay5cbiAgICAgKiBBIGdsb2JhbCBaIGluZGV4IGlzIHByb2R1Y2VkIGJhc2VkIG9uIGl0cyBgemAgdmFsdWUgYXMgd2VsbCBhcyB0aGUgR0lEICh3aGljaCBlbnRpdHkgd2FzIGNyZWF0ZWQgZmlyc3QpLlxuICAgICAqIFRoZXJlZm9yZSBlbnRpdGllcyB3aWxsIG5hdHVyYWxseSBtYWludGFpbiBvcmRlciBkZXBlbmRpbmcgb24gd2hlbiBpdCB3YXMgY3JlYXRlZCBpZiBzYW1lIHogdmFsdWUuXG4gICAgICpcbiAgICAgKiBgemAgaXMgcmVxdWlyZWQgdG8gYmUgYW4gaW50ZWdlciwgZS5nLiBgej0xMS4yYCBpcyBub3QgYWxsb3dlZC5cbiAgICAgKiBAc2VlIC5fYXR0clxuICAgICAqL1xuICAgIF96OiAwLFxuICAgIC8qKkBcbiAgICAgKiAjLnJvdGF0aW9uXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBUaGUgcm90YXRpb24gc3RhdGUgb2YgdGhlIGVudGl0eSwgaW4gY2xvY2t3aXNlIGRlZ3JlZXMuXG4gICAgICogYHRoaXMucm90YXRpb24gPSAwYCBzZXRzIGl0IHRvIGl0cyBvcmlnaW5hbCBvcmllbnRhdGlvbjsgYHRoaXMucm90YXRpb24gPSAxMGBcbiAgICAgKiBzZXRzIGl0IHRvIDEwIGRlZ3JlZXMgY2xvY2t3aXNlIGZyb20gaXRzIG9yaWdpbmFsIG9yaWVudGF0aW9uO1xuICAgICAqIGB0aGlzLnJvdGF0aW9uID0gLTEwYCBzZXRzIGl0IHRvIDEwIGRlZ3JlZXMgY291bnRlcmNsb2Nrd2lzZSBmcm9tIGl0c1xuICAgICAqIG9yaWdpbmFsIG9yaWVudGF0aW9uLCBldGMuXG4gICAgICpcbiAgICAgKiBXaGVuIG1vZGlmaWVkLCB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgcmVkcmF3bi4gSXMgYWN0dWFsbHkgYSBnZXR0ZXIvc2V0dGVyXG4gICAgICogc28gd2hlbiB1c2luZyB0aGlzIHZhbHVlIGZvciBjYWxjdWxhdGlvbnMgYW5kIG5vdCBtb2RpZnlpbmcgaXQsXG4gICAgICogdXNlIHRoZSBgLl9yb3RhdGlvbmAgcHJvcGVydHkuXG4gICAgICpcbiAgICAgKiBgdGhpcy5yb3RhdGlvbiA9IDBgIGRvZXMgdGhlIHNhbWUgdGhpbmcgYXMgYHRoaXMucm90YXRpb24gPSAzNjBgIG9yIGA3MjBgIG9yXG4gICAgICogYC0zNjBgIG9yIGAzNjAwMGAgZXRjLiBTbyB5b3UgY2FuIGtlZXAgaW5jcmVhc2luZyBvciBkZWNyZWFzaW5nIHRoZSBhbmdsZSBmb3IgY29udGludW91c1xuICAgICAqIHJvdGF0aW9uLiAoTnVtZXJpY2FsIGVycm9ycyBkbyBub3Qgb2NjdXIgdW50aWwgeW91IGdldCB0byBtaWxsaW9ucyBvZiBkZWdyZWVzLilcbiAgICAgKlxuICAgICAqIFRoZSBkZWZhdWx0IGlzIHRvIHJvdGF0ZSB0aGUgZW50aXR5IGFyb3VuZCBpdHMgKGluaXRpYWwpIHRvcC1sZWZ0IGNvcm5lcjsgdXNlXG4gICAgICogYC5vcmlnaW4oKWAgdG8gY2hhbmdlIHRoYXQuXG4gICAgICpcbiAgICAgKiBAc2VlIC5fYXR0ciwgLm9yaWdpblxuICAgICAqL1xuICAgIF9yb3RhdGlvbjogMCxcbiAgICAvKipAXG4gICAgICogIy5hbHBoYVxuICAgICAqIEBjb21wIDJEXG4gICAgICogVHJhbnNwYXJlbmN5IG9mIGFuIGVudGl0eS4gTXVzdCBiZSBhIGRlY2ltYWwgdmFsdWUgYmV0d2VlbiAwLjAgYmVpbmcgZnVsbHkgdHJhbnNwYXJlbnQgdG8gMS4wIGJlaW5nIGZ1bGx5IG9wYXF1ZS5cbiAgICAgKi9cbiAgICBfYWxwaGE6IDEuMCxcbiAgICAvKipAXG4gICAgICogIy52aXNpYmxlXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBJZiB0aGUgZW50aXR5IGlzIHZpc2libGUgb3Igbm90LiBBY2NlcHRzIGEgdHJ1ZSBvciBmYWxzZSB2YWx1ZS5cbiAgICAgKiBDYW4gYmUgdXNlZCBmb3Igb3B0aW1pemF0aW9uIGJ5IHNldHRpbmcgYW4gZW50aXRpZXMgdmlzaWJpbGl0eSB0byBmYWxzZSB3aGVuIG5vdCBuZWVkZWQgdG8gYmUgZHJhd24uXG4gICAgICpcbiAgICAgKiBUaGUgZW50aXR5IHdpbGwgc3RpbGwgZXhpc3QgYW5kIGNhbiBiZSBjb2xsaWRlZCB3aXRoIGJ1dCBqdXN0IHdvbid0IGJlIGRyYXduLlxuICAgICAqIEBzZWUgQ3JhZnR5LkRyYXdNYW5hZ2VyLmRyYXcsIENyYWZ0eS5EcmF3TWFuYWdlci5kcmF3QWxsXG4gICAgICovXG4gICAgX3Zpc2libGU6IHRydWUsXG5cbiAgICAvKipAXG4gICAgICogIy5fZ2xvYmFsWlxuICAgICAqIEBjb21wIDJEXG4gICAgICogV2hlbiB0d28gZW50aXRpZXMgb3ZlcmxhcCwgdGhlIG9uZSB3aXRoIHRoZSBsYXJnZXIgYF9nbG9iYWxaYCB3aWxsIGJlIG9uIHRvcCBvZiB0aGUgb3RoZXIuXG4gICAgICogQHNlZSBDcmFmdHkuRHJhd01hbmFnZXIuZHJhdywgQ3JhZnR5LkRyYXdNYW5hZ2VyLmRyYXdBbGxcbiAgICAgKi9cbiAgICBfZ2xvYmFsWjogbnVsbCxcblxuICAgIF9vcmlnaW46IG51bGwsXG4gICAgX21icjogbnVsbCxcbiAgICBfZW50cnk6IG51bGwsXG4gICAgX2NoaWxkcmVuOiBudWxsLFxuICAgIF9wYXJlbnQ6IG51bGwsXG4gICAgX2NoYW5nZWQ6IGZhbHNlLFxuXG4gICAgX2RlZmluZUdldHRlclNldHRlcl9zZXR0ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy9jcmVhdGUgZ2V0dGVycyBhbmQgc2V0dGVycyB1c2luZyBfX2RlZmluZVNldHRlcl9fIGFuZCBfX2RlZmluZUdldHRlcl9fXG4gICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygneCcsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICB0aGlzLl9hdHRyKCdfeCcsIHYpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fX2RlZmluZVNldHRlcl9fKCd5JywgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2F0dHIoJ195Jywgdik7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9fZGVmaW5lU2V0dGVyX18oJ3cnLCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgdGhpcy5fYXR0cignX3cnLCB2KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygnaCcsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICB0aGlzLl9hdHRyKCdfaCcsIHYpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fX2RlZmluZVNldHRlcl9fKCd6JywgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2F0dHIoJ196Jywgdik7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9fZGVmaW5lU2V0dGVyX18oJ3JvdGF0aW9uJywgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgIHRoaXMuX2F0dHIoJ19yb3RhdGlvbicsIHYpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fX2RlZmluZVNldHRlcl9fKCdhbHBoYScsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICB0aGlzLl9hdHRyKCdfYWxwaGEnLCB2KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygndmlzaWJsZScsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICB0aGlzLl9hdHRyKCdfdmlzaWJsZScsIHYpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLl9fZGVmaW5lR2V0dGVyX18oJ3gnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5feDtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygneScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl95O1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fX2RlZmluZUdldHRlcl9fKCd3JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3c7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9fZGVmaW5lR2V0dGVyX18oJ2gnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faDtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygneicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl96O1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fX2RlZmluZUdldHRlcl9fKCdyb3RhdGlvbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yb3RhdGlvbjtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygnYWxwaGEnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYWxwaGE7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl9fZGVmaW5lR2V0dGVyX18oJ3Zpc2libGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fdmlzaWJsZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygncGFyZW50JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhcmVudDtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygnbnVtQ2hpbGRyZW4nLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY2hpbGRyZW4ubGVuZ3RoO1xuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgX2RlZmluZUdldHRlclNldHRlcl9kZWZpbmVQcm9wZXJ0eTogZnVuY3Rpb24gKCkge1xuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ3gnLCB7XG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXR0cignX3gnLCB2KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5feDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd5Jywge1xuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2F0dHIoJ195Jywgdik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3k7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAndycsIHtcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hdHRyKCdfdycsIHYpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl93O1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2gnLCB7XG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXR0cignX2gnLCB2KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5faDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd6Jywge1xuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2F0dHIoJ196Jywgdik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3o7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAncm90YXRpb24nLCB7XG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYXR0cignX3JvdGF0aW9uJywgdik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JvdGF0aW9uO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ2FscGhhJywge1xuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2F0dHIoJ19hbHBoYScsIHYpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9hbHBoYTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd2aXNpYmxlJywge1xuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIHRoaXMuX2F0dHIoJ192aXNpYmxlJywgdik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Zpc2libGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2dsb2JhbFogPSB0aGlzWzBdO1xuICAgICAgICB0aGlzLl9vcmlnaW4gPSB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIG9mZnNldHMgZm9yIHRoZSBiYXNpYyBib3VuZGluZyBib3hcbiAgICAgICAgdGhpcy5fYngxID0gMDtcbiAgICAgICAgdGhpcy5fYngyID0gMDtcbiAgICAgICAgdGhpcy5fYnkxID0gMDtcbiAgICAgICAgdGhpcy5fYnkyID0gMDtcblxuICAgICAgICB0aGlzLl9jaGlsZHJlbiA9IFtdO1xuXG4gICAgICAgIGlmIChDcmFmdHkuc3VwcG9ydC5zZXR0ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2RlZmluZUdldHRlclNldHRlcl9zZXR0ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmIChDcmFmdHkuc3VwcG9ydC5kZWZpbmVQcm9wZXJ0eSkge1xuICAgICAgICAgICAgLy9JRTkgc3VwcG9ydHMgT2JqZWN0LmRlZmluZVByb3BlcnR5XG4gICAgICAgICAgICB0aGlzLl9kZWZpbmVHZXR0ZXJTZXR0ZXJfZGVmaW5lUHJvcGVydHkoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vaW5zZXJ0IHNlbGYgaW50byB0aGUgSGFzaE1hcFxuICAgICAgICB0aGlzLl9lbnRyeSA9IENyYWZ0eS5tYXAuaW5zZXJ0KHRoaXMpO1xuXG4gICAgICAgIC8vd2hlbiBvYmplY3QgY2hhbmdlcywgdXBkYXRlIEhhc2hNYXBcbiAgICAgICAgdGhpcy5iaW5kKFwiTW92ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgLy8gQ2hvb3NlIHRoZSBsYXJnZXN0IGJvdW5kaW5nIHJlZ2lvbiB0aGF0IGV4aXN0c1xuICAgICAgICAgICAgdmFyIGFyZWEgPSB0aGlzLl9jYnIgfHwgdGhpcy5fbWJyIHx8IHRoaXM7XG4gICAgICAgICAgICB0aGlzLl9lbnRyeS51cGRhdGUoYXJlYSk7XG4gICAgICAgICAgICAvLyBNb3ZlIGNoaWxkcmVuIChpZiBhbnkpIGJ5IHRoZSBzYW1lIGFtb3VudFxuICAgICAgICAgICAgaWYgKHRoaXMuX2NoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jYXNjYWRlKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmJpbmQoXCJSb3RhdGVcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIC8vIENob29zZSB0aGUgbGFyZ2VzdCBib3VuZGluZyByZWdpb24gdGhhdCBleGlzdHNcbiAgICAgICAgICAgIHZhciBvbGQgPSB0aGlzLl9jYnIgfHwgdGhpcy5fbWJyIHx8IHRoaXM7XG4gICAgICAgICAgICB0aGlzLl9lbnRyeS51cGRhdGUob2xkKTtcbiAgICAgICAgICAgIC8vIFJvdGF0ZSBjaGlsZHJlbiAoaWYgYW55KSBieSB0aGUgc2FtZSBhbW91bnRcbiAgICAgICAgICAgIGlmICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FzY2FkZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy93aGVuIG9iamVjdCBpcyByZW1vdmVkLCByZW1vdmUgZnJvbSBIYXNoTWFwIGFuZCBkZXN0cm95IGF0dGFjaGVkIGNoaWxkcmVuXG4gICAgICAgIHRoaXMuYmluZChcIlJlbW92ZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fY2hpbGRyZW4pIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRlbGV0ZSB0aGUgY2hpbGQncyBfcGFyZW50IGxpbmssIG9yIGVsc2UgdGhlIGNoaWxkIHdpbGwgc3BsaWNlIGl0c2VsZiBvdXQgb2ZcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcy5fY2hpbGRyZW4gd2hpbGUgZGVzdHJveWluZyBpdHNlbGYgKHdoaWNoIG1lc3NlcyB1cCB0aGlzIGZvci1sb29wIGl0ZXJhdGlvbikuXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9jaGlsZHJlbltpXS5fcGFyZW50O1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIERlc3Ryb3kgY2hpbGQgaWYgcG9zc2libGUgKEl0J3Mgbm90IGFsd2F5cyBwb3NzaWJsZSwgZS5nLiB0aGUgcG9seWdvbiBhdHRhY2hlZFxuICAgICAgICAgICAgICAgICAgICAvLyBieSBhcmVhTWFwIGhhcyBubyAuZGVzdHJveSgpLCBpdCB3aWxsIGp1c3QgZ2V0IGdhcmJhZ2UtY29sbGVjdGVkLilcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX2NoaWxkcmVuW2ldLmRlc3Ryb3kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NoaWxkcmVuW2ldLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLl9jaGlsZHJlbiA9IFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5fcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGFyZW50LmRldGFjaCh0aGlzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgQ3JhZnR5Lm1hcC5yZW1vdmUodGhpcyk7XG5cbiAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH0pO1xuICAgIH0sXG5cblxuICAgIC8qKkBcbiAgICAgKiAjLm9mZnNldEJvdW5kYXJ5XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBFeHRlbmRzIHRoZSBNQlIgb2YgdGhlIGVudGl0eSBieSBhIHNwZWNpZmllZCBhbW91bnQuXG4gICAgICogXG4gICAgICogQHRyaWdnZXIgQm91bmRhcnlPZmZzZXQgLSB3aGVuIHRoZSBNQlIgb2Zmc2V0IGNoYW5nZXNcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAub2Zmc2V0Qm91bmRhcnkoTnVtYmVyIGR4MSwgTnVtYmVyIGR5MSwgTnVtYmVyIGR4MiwgTnVtYmVyIGR5MilcbiAgICAgKiBAcGFyYW0gZHgxIC0gRXh0ZW5kcyB0aGUgTUJSIHRvIHRoZSBsZWZ0IGJ5IHRoaXMgYW1vdW50XG4gICAgICogQHBhcmFtIGR5MSAtIEV4dGVuZHMgdGhlIE1CUiB1cHdhcmQgYnkgdGhpcyBhbW91bnRcbiAgICAgKiBAcGFyYW0gZHgyIC0gRXh0ZW5kcyB0aGUgTUJSIHRvIHRoZSByaWdodCBieSB0aGlzIGFtb3VudFxuICAgICAqIEBwYXJhbSBkeTIgLSBFeHRlbmRzIHRoZSBNQlIgZG93bndhcmQgYnkgdGhpcyBhbW91bnRcbiAgICAgKlxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5vZmZzZXRCb3VuZGFyeShOdW1iZXIgb2Zmc2V0KVxuICAgICAqIEBwYXJhbSBvZmZzZXQgLSBFeHRlbmQgdGhlIE1CUiBpbiBhbGwgZGlyZWN0aW9ucyBieSB0aGlzIGFtb3VudFxuICAgICAqXG4gICAgICogWW91IHdvdWxkIG1vc3QgbGlrZWx5IHVzZSB0aGlzIGZ1bmN0aW9uIHRvIGVuc3VyZSB0aGF0IGN1c3RvbSBjYW52YXMgcmVuZGVyaW5nIGJleW9uZCB0aGUgZXh0ZW50IG9mIHRoZSBlbnRpdHkncyBub3JtYWwgYm91bmRzIGlzIG5vdCBjbGlwcGVkLlxuICAgICAqL1xuICAgIG9mZnNldEJvdW5kYXJ5OiBmdW5jdGlvbih4MSwgeTEsIHgyLCB5Mil7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKVxuICAgICAgICAgICAgeTEgPSB4MiA9IHkyID0geDE7XG4gICAgICAgIHRoaXMuX2J4MSA9IHgxO1xuICAgICAgICB0aGlzLl9ieDIgPSB4MjtcbiAgICAgICAgdGhpcy5fYnkxID0geTE7XG4gICAgICAgIHRoaXMuX2J5MiA9IHkyO1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJCb3VuZGFyeU9mZnNldFwiKTtcbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlTUJSKCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBNQlIgd2hlbiByb3RhdGVkIHNvbWUgbnVtYmVyIG9mIHJhZGlhbnMgYWJvdXQgYW4gb3JpZ2luIHBvaW50IG8uXG4gICAgICogTmVjZXNzYXJ5IG9uIGEgcm90YXRpb24sIG9yIGEgcmVzaXplXG4gICAgICovXG5cbiAgICBfY2FsY3VsYXRlTUJSOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBveCA9IHRoaXMuX29yaWdpbi54ICsgdGhpcy5feCxcbiAgICAgICAgICAgIG95ID0gdGhpcy5fb3JpZ2luLnkgKyB0aGlzLl95LFxuICAgICAgICAgICAgcmFkID0gLXRoaXMuX3JvdGF0aW9uICogREVHX1RPX1JBRDtcbiAgICAgICAgLy8gYXhpcy1hbGlnbmVkICh1bnJvdGF0ZWQpIGNvb3JkaW5hdGVzLCByZWxhdGl2ZSB0byB0aGUgb3JpZ2luIHBvaW50XG4gICAgICAgIHZhciBkeDEgPSB0aGlzLl94IC0gdGhpcy5fYngxIC0gb3gsXG4gICAgICAgICAgICBkeDIgPSB0aGlzLl94ICsgdGhpcy5fdyArIHRoaXMuX2J4MiAtIG94LFxuICAgICAgICAgICAgZHkxID0gdGhpcy5feSAtIHRoaXMuX2J5MSAtIG95LFxuICAgICAgICAgICAgZHkyID0gdGhpcy5feSArIHRoaXMuX2ggKyB0aGlzLl9ieTIgLSBveTtcblxuICAgICAgICB2YXIgY3QgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICAgICAgc3QgPSBNYXRoLnNpbihyYWQpO1xuICAgICAgICAvLyBTcGVjaWFsIGNhc2UgOTAgZGVncmVlIHJvdGF0aW9ucyB0byBwcmV2ZW50IHJvdW5kaW5nIHByb2JsZW1zXG4gICAgICAgIGN0ID0gKGN0IDwgMWUtMTAgJiYgY3QgPiAtMWUtMTApID8gMCA6IGN0O1xuICAgICAgICBzdCA9IChzdCA8IDFlLTEwICYmIHN0ID4gLTFlLTEwKSA/IDAgOiBzdDtcblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIG5ldyBwb2ludHMgcmVsYXRpdmUgdG8gdGhlIG9yaWdpbiwgdGhlbiBmaW5kIHRoZSBuZXcgKGFic29sdXRlKSBib3VuZGluZyBjb29yZGluYXRlcyFcbiAgICAgICAgdmFyIHgwID0gICBkeDEgKiBjdCArIGR5MSAqIHN0LFxuICAgICAgICAgICAgeTAgPSAtIGR4MSAqIHN0ICsgZHkxICogY3QsXG4gICAgICAgICAgICB4MSA9ICAgZHgyICogY3QgKyBkeTEgKiBzdCxcbiAgICAgICAgICAgIHkxID0gLSBkeDIgKiBzdCArIGR5MSAqIGN0LFxuICAgICAgICAgICAgeDIgPSAgIGR4MiAqIGN0ICsgZHkyICogc3QsXG4gICAgICAgICAgICB5MiA9IC0gZHgyICogc3QgKyBkeTIgKiBjdCxcbiAgICAgICAgICAgIHgzID0gICBkeDEgKiBjdCArIGR5MiAqIHN0LFxuICAgICAgICAgICAgeTMgPSAtIGR4MSAqIHN0ICsgZHkyICogY3QsXG4gICAgICAgICAgICBtaW54ID0gTWF0aC5mbG9vcihNYXRoLm1pbih4MCwgeDEsIHgyLCB4MykgKyBveCksXG4gICAgICAgICAgICBtaW55ID0gTWF0aC5mbG9vcihNYXRoLm1pbih5MCwgeTEsIHkyLCB5MykgKyBveSksXG4gICAgICAgICAgICBtYXh4ID0gTWF0aC5jZWlsKE1hdGgubWF4KHgwLCB4MSwgeDIsIHgzKSArIG94KSxcbiAgICAgICAgICAgIG1heHkgPSBNYXRoLmNlaWwoTWF0aC5tYXgoeTAsIHkxLCB5MiwgeTMpICsgb3kpO1xuICAgICAgICBpZiAoIXRoaXMuX21icikge1xuICAgICAgICAgICAgdGhpcy5fbWJyID0ge1xuICAgICAgICAgICAgICAgIF94OiBtaW54LFxuICAgICAgICAgICAgICAgIF95OiBtaW55LFxuICAgICAgICAgICAgICAgIF93OiBtYXh4IC0gbWlueCxcbiAgICAgICAgICAgICAgICBfaDogbWF4eSAtIG1pbnlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9tYnIuX3ggPSBtaW54O1xuICAgICAgICAgICAgdGhpcy5fbWJyLl95ID0gbWlueTtcbiAgICAgICAgICAgIHRoaXMuX21ici5fdyA9IG1heHggLSBtaW54O1xuICAgICAgICAgICAgdGhpcy5fbWJyLl9oID0gbWF4eSAtIG1pbnk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiBhIGNvbGxpc2lvbiBoaXRib3ggZXhpc3RzIEFORCBzaXRzIG91dHNpZGUgdGhlIGVudGl0eSwgZmluZCBhIGJvdW5kaW5nIGJveCBmb3IgYm90aC5cbiAgICAgICAgLy8gYF9jYnJgIGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IGEgYm91bmRpbmcgY2lyY2xlIG9mIHRoZSBoaXRib3guIFxuICAgICAgICAvLyBUaGUgYm91bmRzIG9mIGBfY2JyYCB3aWxsIGJlIHRoZSB1bmlvbiBvZiB0aGUgYF9tYnJgIGFuZCB0aGUgYm91bmRpbmcgYm94IG9mIHRoYXQgY2lyY2xlLlxuICAgICAgICAvLyBUaGlzIHdpbGwgbm90IGJlIGEgbWluaW1hbCByZWdpb24sIGJ1dCBzaW5jZSBpdCdzIG9ubHkgdXNlZCBmb3IgdGhlIGJyb2FkIHBoYXNlIHBhc3MgaXQncyBnb29kIGVub3VnaC4gXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGNiciBpcyBjYWxjdWxhdGVkIGJ5IHRoZSBgX2NoZWNrQm91bmRzYCBtZXRob2Qgb2YgdGhlIFwiQ29sbGlzaW9uXCIgY29tcG9uZW50XG4gICAgICAgIGlmICh0aGlzLl9jYnIpIHtcbiAgICAgICAgICAgIHZhciBjYnIgPSB0aGlzLl9jYnI7XG4gICAgICAgICAgICB2YXIgY3ggPSBjYnIuY3gsIGN5ID0gY2JyLmN5LCByID0gY2JyLnI7XG4gICAgICAgICAgICB2YXIgY3gyID0gb3ggKyAoY3ggKyB0aGlzLl94IC0gb3gpICogY3QgKyAoY3kgKyB0aGlzLl95IC0gb3kpICogc3Q7XG4gICAgICAgICAgICB2YXIgY3kyID0gb3kgLSAoY3ggKyB0aGlzLl94IC0gb3gpICogc3QgKyAoY3kgKyB0aGlzLl95IC0gb3kpICogY3Q7XG4gICAgICAgICAgICBjYnIuX3ggPSBNYXRoLm1pbihjeDIgLSByLCBtaW54KTtcbiAgICAgICAgICAgIGNici5feSA9IE1hdGgubWluKGN5MiAtIHIsIG1pbnkpO1xuICAgICAgICAgICAgY2JyLl93ID0gTWF0aC5tYXgoY3gyICsgciwgbWF4eCkgLSBjYnIuX3g7XG4gICAgICAgICAgICBjYnIuX2ggPSBNYXRoLm1heChjeTIgKyByLCBtYXh5KSAtIGNici5feTtcbiAgICAgICAgfVxuXG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEhhbmRsZSBjaGFuZ2VzIHRoYXQgbmVlZCB0byBoYXBwZW4gb24gYSByb3RhdGlvblxuICAgICAqL1xuICAgIF9yb3RhdGU6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgIHZhciB0aGV0YSA9IC0xICogKHYgJSAzNjApOyAvL2FuZ2xlIGFsd2F5cyBiZXR3ZWVuIDAgYW5kIDM1OVxuICAgICAgICB2YXIgZGlmZmVyZW5jZSA9IHRoaXMuX3JvdGF0aW9uIC0gdjtcbiAgICAgICAgLy8gc2tpcCBpZiB0aGVyZSdzIG5vIHJvdGF0aW9uIVxuICAgICAgICBpZiAoZGlmZmVyZW5jZSA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5fcm90YXRpb24gPSB2O1xuXG4gICAgICAgIC8vQ2FsY3VsYXRlIHRoZSBuZXcgTUJSXG4gICAgICAgIHZhciByYWQgPSB0aGV0YSAqIERFR19UT19SQUQsXG4gICAgICAgICAgICBvID0ge1xuICAgICAgICAgICAgICAgIHg6IHRoaXMuX29yaWdpbi54ICsgdGhpcy5feCxcbiAgICAgICAgICAgICAgICB5OiB0aGlzLl9vcmlnaW4ueSArIHRoaXMuX3lcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5fY2FsY3VsYXRlTUJSKCk7XG5cblxuICAgICAgICAvL3RyaWdnZXIgXCJSb3RhdGVcIiBldmVudFxuICAgICAgICB2YXIgZHJhZCA9IGRpZmZlcmVuY2UgKiBERUdfVE9fUkFELFxuICAgICAgICAgICAgY3QgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICAgICAgc3QgPSBNYXRoLnNpbihyYWQpO1xuXG4gICAgICAgIHRoaXMudHJpZ2dlcihcIlJvdGF0ZVwiLCB7XG4gICAgICAgICAgICBjb3M6IE1hdGguY29zKGRyYWQpLFxuICAgICAgICAgICAgc2luOiBNYXRoLnNpbihkcmFkKSxcbiAgICAgICAgICAgIGRlZzogZGlmZmVyZW5jZSxcbiAgICAgICAgICAgIHJhZDogZHJhZCxcbiAgICAgICAgICAgIG86IG9cbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmFyZWFcbiAgICAgKiBAY29tcCAyRFxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgLmFyZWEodm9pZClcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBhcmVhIG9mIHRoZSBlbnRpdHlcbiAgICAgKi9cbiAgICBhcmVhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl93ICogdGhpcy5faDtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuaW50ZXJzZWN0XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgQm9vbGVhbiAuaW50ZXJzZWN0KE51bWJlciB4LCBOdW1iZXIgeSwgTnVtYmVyIHcsIE51bWJlciBoKVxuICAgICAqIEBwYXJhbSB4IC0gWCBwb3NpdGlvbiBvZiB0aGUgcmVjdFxuICAgICAqIEBwYXJhbSB5IC0gWSBwb3NpdGlvbiBvZiB0aGUgcmVjdFxuICAgICAqIEBwYXJhbSB3IC0gV2lkdGggb2YgdGhlIHJlY3RcbiAgICAgKiBAcGFyYW0gaCAtIEhlaWdodCBvZiB0aGUgcmVjdFxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIC5pbnRlcnNlY3QoT2JqZWN0IHJlY3QpXG4gICAgICogQHBhcmFtIHJlY3QgLSBBbiBvYmplY3QgdGhhdCBtdXN0IGhhdmUgdGhlIGB4LCB5LCB3LCBoYCB2YWx1ZXMgYXMgcHJvcGVydGllc1xuICAgICAqIERldGVybWluZXMgaWYgdGhpcyBlbnRpdHkgaW50ZXJzZWN0cyBhIHJlY3RhbmdsZS4gIElmIHRoZSBlbnRpdHkgaXMgcm90YXRlZCwgaXRzIE1CUiBpcyB1c2VkIGZvciB0aGUgdGVzdC5cbiAgICAgKi9cbiAgICBpbnRlcnNlY3Q6IGZ1bmN0aW9uICh4LCB5LCB3LCBoKSB7XG4gICAgICAgIHZhciByZWN0LCBtYnIgPSB0aGlzLl9tYnIgfHwgdGhpcztcbiAgICAgICAgaWYgKHR5cGVvZiB4ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICByZWN0ID0geDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlY3QgPSB7XG4gICAgICAgICAgICAgICAgeDogeCxcbiAgICAgICAgICAgICAgICB5OiB5LFxuICAgICAgICAgICAgICAgIHc6IHcsXG4gICAgICAgICAgICAgICAgaDogaFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYnIuX3ggPCByZWN0LnggKyByZWN0LncgJiYgbWJyLl94ICsgbWJyLl93ID4gcmVjdC54ICYmXG4gICAgICAgICAgICBtYnIuX3kgPCByZWN0LnkgKyByZWN0LmggJiYgbWJyLl9oICsgbWJyLl95ID4gcmVjdC55O1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy53aXRoaW5cbiAgICAgKiBAY29tcCAyRFxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIC53aXRoaW4oTnVtYmVyIHgsIE51bWJlciB5LCBOdW1iZXIgdywgTnVtYmVyIGgpXG4gICAgICogQHBhcmFtIHggLSBYIHBvc2l0aW9uIG9mIHRoZSByZWN0XG4gICAgICogQHBhcmFtIHkgLSBZIHBvc2l0aW9uIG9mIHRoZSByZWN0XG4gICAgICogQHBhcmFtIHcgLSBXaWR0aCBvZiB0aGUgcmVjdFxuICAgICAqIEBwYXJhbSBoIC0gSGVpZ2h0IG9mIHRoZSByZWN0XG4gICAgICogQHNpZ24gcHVibGljIEJvb2xlYW4gLndpdGhpbihPYmplY3QgcmVjdClcbiAgICAgKiBAcGFyYW0gcmVjdCAtIEFuIG9iamVjdCB0aGF0IG11c3QgaGF2ZSB0aGUgYF94LCBfeSwgX3csIF9oYCB2YWx1ZXMgYXMgcHJvcGVydGllc1xuICAgICAqIERldGVybWluZXMgaWYgdGhpcyBjdXJyZW50IGVudGl0eSBpcyB3aXRoaW4gYW5vdGhlciByZWN0YW5nbGUuXG4gICAgICovXG4gICAgd2l0aGluOiBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgICB2YXIgcmVjdCwgbWJyID0gdGhpcy5fbWJyIHx8IHRoaXM7XG4gICAgICAgIGlmICh0eXBlb2YgeCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgcmVjdCA9IHg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWN0ID0ge1xuICAgICAgICAgICAgICAgIF94OiB4LFxuICAgICAgICAgICAgICAgIF95OiB5LFxuICAgICAgICAgICAgICAgIF93OiB3LFxuICAgICAgICAgICAgICAgIF9oOiBoXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlY3QuX3ggPD0gbWJyLl94ICYmIHJlY3QuX3ggKyByZWN0Ll93ID49IG1ici5feCArIG1ici5fdyAmJlxuICAgICAgICAgICAgcmVjdC5feSA8PSBtYnIuX3kgJiYgcmVjdC5feSArIHJlY3QuX2ggPj0gbWJyLl95ICsgbWJyLl9oO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5jb250YWluc1xuICAgICAqIEBjb21wIDJEXG4gICAgICogQHNpZ24gcHVibGljIEJvb2xlYW4gLmNvbnRhaW5zKE51bWJlciB4LCBOdW1iZXIgeSwgTnVtYmVyIHcsIE51bWJlciBoKVxuICAgICAqIEBwYXJhbSB4IC0gWCBwb3NpdGlvbiBvZiB0aGUgcmVjdFxuICAgICAqIEBwYXJhbSB5IC0gWSBwb3NpdGlvbiBvZiB0aGUgcmVjdFxuICAgICAqIEBwYXJhbSB3IC0gV2lkdGggb2YgdGhlIHJlY3RcbiAgICAgKiBAcGFyYW0gaCAtIEhlaWdodCBvZiB0aGUgcmVjdFxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIC5jb250YWlucyhPYmplY3QgcmVjdClcbiAgICAgKiBAcGFyYW0gcmVjdCAtIEFuIG9iamVjdCB0aGF0IG11c3QgaGF2ZSB0aGUgYF94LCBfeSwgX3csIF9oYCB2YWx1ZXMgYXMgcHJvcGVydGllcy5cbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSByZWN0YW5nbGUgaXMgd2l0aGluIHRoZSBjdXJyZW50IGVudGl0eS4gIElmIHRoZSBlbnRpdHkgaXMgcm90YXRlZCwgaXRzIE1CUiBpcyB1c2VkIGZvciB0aGUgdGVzdC5cbiAgICAgKi9cbiAgICBjb250YWluczogZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgICAgdmFyIHJlY3QsIG1iciA9IHRoaXMuX21iciB8fCB0aGlzO1xuICAgICAgICBpZiAodHlwZW9mIHggPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIHJlY3QgPSB4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVjdCA9IHtcbiAgICAgICAgICAgICAgICBfeDogeCxcbiAgICAgICAgICAgICAgICBfeTogeSxcbiAgICAgICAgICAgICAgICBfdzogdyxcbiAgICAgICAgICAgICAgICBfaDogaFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZWN0Ll94ID49IG1ici5feCAmJiByZWN0Ll94ICsgcmVjdC5fdyA8PSBtYnIuX3ggKyBtYnIuX3cgJiZcbiAgICAgICAgICAgIHJlY3QuX3kgPj0gbWJyLl95ICYmIHJlY3QuX3kgKyByZWN0Ll9oIDw9IG1ici5feSArIG1ici5faDtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMucG9zXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgT2JqZWN0IC5wb3Modm9pZClcbiAgICAgKiBSZXR1cm5zIHRoZSB4LCB5LCB3LCBoIHByb3BlcnRpZXMgYXMgYSByZWN0IG9iamVjdFxuICAgICAqIChhIHJlY3Qgb2JqZWN0IGlzIGp1c3QgYW4gb2JqZWN0IHdpdGggdGhlIGtleXMgX3gsIF95LCBfdywgX2gpLlxuICAgICAqXG4gICAgICogVGhlIGtleXMgaGF2ZSBhbiB1bmRlcnNjb3JlIHByZWZpeC4gVGhpcyBpcyBkdWUgdG8gdGhlIHgsIHksIHcsIGhcbiAgICAgKiBwcm9wZXJ0aWVzIGJlaW5nIG1lcmVseSBzZXR0ZXJzIGFuZCBnZXR0ZXJzIHRoYXQgd3JhcCB0aGUgcHJvcGVydGllcyB3aXRoIGFuIHVuZGVyc2NvcmUgKF94LCBfeSwgX3csIF9oKS5cbiAgICAgKi9cbiAgICBwb3M6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIF94OiAodGhpcy5feCksXG4gICAgICAgICAgICBfeTogKHRoaXMuX3kpLFxuICAgICAgICAgICAgX3c6ICh0aGlzLl93KSxcbiAgICAgICAgICAgIF9oOiAodGhpcy5faClcbiAgICAgICAgfTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMubWJyXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgT2JqZWN0IC5tYnIoKVxuICAgICAqIFJldHVybnMgdGhlIG1pbmltdW0gYm91bmRpbmcgcmVjdGFuZ2xlLiBJZiB0aGVyZSBpcyBubyByb3RhdGlvblxuICAgICAqIG9uIHRoZSBlbnRpdHkgaXQgd2lsbCByZXR1cm4gdGhlIHJlY3QuXG4gICAgICovXG4gICAgbWJyOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5fbWJyKSByZXR1cm4gdGhpcy5wb3MoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIF94OiAodGhpcy5fbWJyLl94KSxcbiAgICAgICAgICAgIF95OiAodGhpcy5fbWJyLl95KSxcbiAgICAgICAgICAgIF93OiAodGhpcy5fbWJyLl93KSxcbiAgICAgICAgICAgIF9oOiAodGhpcy5fbWJyLl9oKVxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5pc0F0XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgQm9vbGVhbiAuaXNBdChOdW1iZXIgeCwgTnVtYmVyIHkpXG4gICAgICogQHBhcmFtIHggLSBYIHBvc2l0aW9uIG9mIHRoZSBwb2ludFxuICAgICAqIEBwYXJhbSB5IC0gWSBwb3NpdGlvbiBvZiB0aGUgcG9pbnRcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgYSBwb2ludCBpcyBjb250YWluZWQgYnkgdGhlIGVudGl0eS4gVW5saWtlIG90aGVyIG1ldGhvZHMsXG4gICAgICogYW4gb2JqZWN0IGNhbid0IGJlIHBhc3NlZC4gVGhlIGFyZ3VtZW50cyByZXF1aXJlIHRoZSB4IGFuZCB5IHZhbHVlLlxuICAgICAqXG4gICAgICogVGhlIGdpdmVuIHBvaW50IGlzIHRlc3RlZCBhZ2FpbnN0IHRoZSBmaXJzdCBvZiB0aGUgZm9sbG93aW5nIHRoYXQgZXhpc3RzOiBhIG1hcEFyZWEgYXNzb2NpYXRlZCB3aXRoIFwiTW91c2VcIiwgdGhlIGhpdGFyZWEgYXNzb2NpYXRlZCB3aXRoIFwiQ29sbGlzaW9uXCIsIG9yIHRoZSBvYmplY3QncyBNQlIuXG4gICAgICovXG4gICAgaXNBdDogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgaWYgKHRoaXMubWFwQXJlYSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubWFwQXJlYS5jb250YWluc1BvaW50KHgsIHkpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubWFwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tYXAuY29udGFpbnNQb2ludCh4LCB5KTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbWJyID0gdGhpcy5fbWJyIHx8IHRoaXM7XG4gICAgICAgIHJldHVybiBtYnIuX3ggPD0geCAmJiBtYnIuX3ggKyBtYnIuX3cgPj0geCAmJlxuICAgICAgICAgICAgbWJyLl95IDw9IHkgJiYgbWJyLl95ICsgbWJyLl9oID49IHk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLm1vdmVcbiAgICAgKiBAY29tcCAyRFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5tb3ZlKFN0cmluZyBkaXIsIE51bWJlciBieSlcbiAgICAgKiBAcGFyYW0gZGlyIC0gRGlyZWN0aW9uIHRvIG1vdmUgKG4scyxlLHcsbmUsbncsc2Usc3cpXG4gICAgICogQHBhcmFtIGJ5IC0gQW1vdW50IHRvIG1vdmUgaW4gdGhlIHNwZWNpZmllZCBkaXJlY3Rpb25cbiAgICAgKiBRdWljayBtZXRob2QgdG8gbW92ZSB0aGUgZW50aXR5IGluIGEgZGlyZWN0aW9uIChuLCBzLCBlLCB3LCBuZSwgbncsIHNlLCBzdykgYnkgYW4gYW1vdW50IG9mIHBpeGVscy5cbiAgICAgKi9cbiAgICBtb3ZlOiBmdW5jdGlvbiAoZGlyLCBieSkge1xuICAgICAgICBpZiAoZGlyLmNoYXJBdCgwKSA9PT0gJ24nKSB0aGlzLnkgLT0gYnk7XG4gICAgICAgIGlmIChkaXIuY2hhckF0KDApID09PSAncycpIHRoaXMueSArPSBieTtcbiAgICAgICAgaWYgKGRpciA9PT0gJ2UnIHx8IGRpci5jaGFyQXQoMSkgPT09ICdlJykgdGhpcy54ICs9IGJ5O1xuICAgICAgICBpZiAoZGlyID09PSAndycgfHwgZGlyLmNoYXJBdCgxKSA9PT0gJ3cnKSB0aGlzLnggLT0gYnk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLnNoaWZ0XG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuc2hpZnQoTnVtYmVyIHgsIE51bWJlciB5LCBOdW1iZXIgdywgTnVtYmVyIGgpXG4gICAgICogQHBhcmFtIHggLSBBbW91bnQgdG8gbW92ZSBYXG4gICAgICogQHBhcmFtIHkgLSBBbW91bnQgdG8gbW92ZSBZXG4gICAgICogQHBhcmFtIHcgLSBBbW91bnQgdG8gd2lkZW5cbiAgICAgKiBAcGFyYW0gaCAtIEFtb3VudCB0byBpbmNyZWFzZSBoZWlnaHRcbiAgICAgKiBTaGlmdCBvciBtb3ZlIHRoZSBlbnRpdHkgYnkgYW4gYW1vdW50LiBVc2UgbmVnYXRpdmUgdmFsdWVzXG4gICAgICogZm9yIGFuIG9wcG9zaXRlIGRpcmVjdGlvbi5cbiAgICAgKi9cbiAgICBzaGlmdDogZnVuY3Rpb24gKHgsIHksIHcsIGgpIHtcbiAgICAgICAgaWYgKHgpIHRoaXMueCArPSB4O1xuICAgICAgICBpZiAoeSkgdGhpcy55ICs9IHk7XG4gICAgICAgIGlmICh3KSB0aGlzLncgKz0gdztcbiAgICAgICAgaWYgKGgpIHRoaXMuaCArPSBoO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5fY2FzY2FkZVxuICAgICAqIEBjb21wIDJEXG4gICAgICogQHNpZ24gcHVibGljIHZvaWQgLl9jYXNjYWRlKGUpXG4gICAgICogQHBhcmFtIGUgLSBBbiBvYmplY3QgZGVzY3JpYmluZyB0aGUgbW90aW9uXG4gICAgICogTW92ZSBvciByb3RhdGUgdGhlIGVudGl0eSdzIGNoaWxkcmVuIGFjY29yZGluZyB0byBhIGNlcnRhaW4gbW90aW9uLlxuICAgICAqIFRoaXMgbWV0aG9kIGlzIHBhcnQgb2YgYSBmdW5jdGlvbiBib3VuZCB0byBcIk1vdmVcIjogSXQgaXMgdXNlZFxuICAgICAqIGludGVybmFsbHkgZm9yIGVuc3VyaW5nIHRoYXQgd2hlbiBhIHBhcmVudCBtb3ZlcywgdGhlIGNoaWxkIGFsc29cbiAgICAgKiBtb3ZlcyBpbiB0aGUgc2FtZSB3YXkuXG4gICAgICovXG4gICAgX2Nhc2NhZGU6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIGlmICghZSkgcmV0dXJuOyAvL25vIGNoYW5nZSBpbiBwb3NpdGlvblxuICAgICAgICB2YXIgaSA9IDAsXG4gICAgICAgICAgICBjaGlsZHJlbiA9IHRoaXMuX2NoaWxkcmVuLFxuICAgICAgICAgICAgbCA9IGNoaWxkcmVuLmxlbmd0aCxcbiAgICAgICAgICAgIG9iajtcbiAgICAgICAgLy9yb3RhdGlvblxuICAgICAgICBpZiAoZS5jb3MpIHtcbiAgICAgICAgICAgIGZvciAoOyBpIDwgbDsgKytpKSB7XG4gICAgICAgICAgICAgICAgb2JqID0gY2hpbGRyZW5baV07XG4gICAgICAgICAgICAgICAgaWYgKCdyb3RhdGUnIGluIG9iaikgb2JqLnJvdGF0ZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vdXNlIGN1cnJlbnQgcG9zaXRpb25cbiAgICAgICAgICAgIHZhciBkeCA9IHRoaXMuX3ggLSBlLl94LFxuICAgICAgICAgICAgICAgIGR5ID0gdGhpcy5feSAtIGUuX3ksXG4gICAgICAgICAgICAgICAgZHcgPSB0aGlzLl93IC0gZS5fdyxcbiAgICAgICAgICAgICAgICBkaCA9IHRoaXMuX2ggLSBlLl9oO1xuXG4gICAgICAgICAgICBmb3IgKDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgICAgIG9iaiA9IGNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgICAgIG9iai5zaGlmdChkeCwgZHksIGR3LCBkaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuYXR0YWNoXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuYXR0YWNoKEVudGl0eSBvYmpbLCAuLiwgRW50aXR5IG9iak5dKVxuICAgICAqIEBwYXJhbSBvYmogLSBDaGlsZCBlbnRpdHkocykgdG8gYXR0YWNoXG4gICAgICogU2V0cyBvbmUgb3IgbW9yZSBlbnRpdGllcyB0byBiZSBjaGlsZHJlbiwgd2l0aCB0aGUgY3VycmVudCBlbnRpdHkgKGB0aGlzYClcbiAgICAgKiBhcyB0aGUgcGFyZW50LiBXaGVuIHRoZSBwYXJlbnQgbW92ZXMgb3Igcm90YXRlcywgaXRzIGNoaWxkcmVuIG1vdmUgb3JcbiAgICAgKiByb3RhdGUgYnkgdGhlIHNhbWUgYW1vdW50LiAoQnV0IG5vdCB2aWNlLXZlcnNhOiBJZiB5b3UgbW92ZSBhIGNoaWxkLCBpdFxuICAgICAqIHdpbGwgbm90IG1vdmUgdGhlIHBhcmVudC4pIFdoZW4gdGhlIHBhcmVudCBpcyBkZXN0cm95ZWQsIGl0cyBjaGlsZHJlbiBhcmVcbiAgICAgKiBkZXN0cm95ZWQuXG4gICAgICpcbiAgICAgKiBGb3IgYW55IGVudGl0eSwgYHRoaXMuX2NoaWxkcmVuYCBpcyB0aGUgYXJyYXkgb2YgaXRzIGNoaWxkcmVuIGVudGl0eVxuICAgICAqIG9iamVjdHMgKGlmIGFueSksIGFuZCBgdGhpcy5fcGFyZW50YCBpcyBpdHMgcGFyZW50IGVudGl0eSBvYmplY3QgKGlmIGFueSkuXG4gICAgICpcbiAgICAgKiBBcyBtYW55IG9iamVjdHMgYXMgd2FudGVkIGNhbiBiZSBhdHRhY2hlZCwgYW5kIGEgaGllcmFyY2h5IG9mIG9iamVjdHMgaXNcbiAgICAgKiBwb3NzaWJsZSBieSBhdHRhY2hpbmcuXG4gICAgICovXG4gICAgYXR0YWNoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgIGFyZyA9IGFyZ3VtZW50cyxcbiAgICAgICAgICAgIGwgPSBhcmd1bWVudHMubGVuZ3RoLFxuICAgICAgICAgICAgb2JqO1xuICAgICAgICBmb3IgKDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgb2JqID0gYXJnW2ldO1xuICAgICAgICAgICAgaWYgKG9iai5fcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgb2JqLl9wYXJlbnQuZGV0YWNoKG9iaik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvYmouX3BhcmVudCA9IHRoaXM7XG4gICAgICAgICAgICB0aGlzLl9jaGlsZHJlbi5wdXNoKG9iaik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuZGV0YWNoXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuZGV0YWNoKFtFbnRpdHkgb2JqXSlcbiAgICAgKiBAcGFyYW0gb2JqIC0gVGhlIGVudGl0eSB0byBkZXRhY2guIExlZnQgYmxhbmsgd2lsbCByZW1vdmUgYWxsIGF0dGFjaGVkIGVudGl0aWVzXG4gICAgICogU3RvcCBhbiBlbnRpdHkgZnJvbSBmb2xsb3dpbmcgdGhlIGN1cnJlbnQgZW50aXR5LiBQYXNzaW5nIG5vIGFyZ3VtZW50cyB3aWxsIHN0b3BcbiAgICAgKiBldmVyeSBlbnRpdHkgYXR0YWNoZWQuXG4gICAgICovXG4gICAgZGV0YWNoOiBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIHZhciBpO1xuICAgICAgICAvL2lmIG5vdGhpbmcgcGFzc2VkLCByZW1vdmUgYWxsIGF0dGFjaGVkIG9iamVjdHNcbiAgICAgICAgaWYgKCFvYmopIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB0aGlzLl9jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NoaWxkcmVuW2ldLl9wYXJlbnQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fY2hpbGRyZW4gPSBbXTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9pZiBvYmogcGFzc2VkLCBmaW5kIHRoZSBoYW5kbGVyIGFuZCB1bmJpbmRcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHRoaXMuX2NoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fY2hpbGRyZW5baV0gPT0gb2JqKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hpbGRyZW4uc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG9iai5fcGFyZW50ID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMub3JpZ2luXG4gICAgICogQGNvbXAgMkRcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAub3JpZ2luKE51bWJlciB4LCBOdW1iZXIgeSlcbiAgICAgKiBAcGFyYW0geCAtIFBpeGVsIHZhbHVlIG9mIG9yaWdpbiBvZmZzZXQgb24gdGhlIFggYXhpc1xuICAgICAqIEBwYXJhbSB5IC0gUGl4ZWwgdmFsdWUgb2Ygb3JpZ2luIG9mZnNldCBvbiB0aGUgWSBheGlzXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLm9yaWdpbihTdHJpbmcgb2Zmc2V0KVxuICAgICAqIEBwYXJhbSBvZmZzZXQgLSBDb21iaW5hdGlvbiBvZiBjZW50ZXIsIHRvcCwgYm90dG9tLCBtaWRkbGUsIGxlZnQgYW5kIHJpZ2h0XG4gICAgICogU2V0IHRoZSBvcmlnaW4gcG9pbnQgb2YgYW4gZW50aXR5IGZvciBpdCB0byByb3RhdGUgYXJvdW5kLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB0aGlzLm9yaWdpbihcInRvcCBsZWZ0XCIpXG4gICAgICogdGhpcy5vcmlnaW4oXCJjZW50ZXJcIilcbiAgICAgKiB0aGlzLm9yaWdpbihcImJvdHRvbSByaWdodFwiKVxuICAgICAqIHRoaXMub3JpZ2luKFwibWlkZGxlIHJpZ2h0XCIpXG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIC5yb3RhdGlvblxuICAgICAqL1xuICAgIG9yaWdpbjogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgLy90ZXh0IGJhc2VkIG9yaWdpblxuICAgICAgICBpZiAodHlwZW9mIHggPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGlmICh4ID09PSBcImNlbnRyZVwiIHx8IHggPT09IFwiY2VudGVyXCIgfHwgeC5pbmRleE9mKCcgJykgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgeCA9IHRoaXMuX3cgLyAyO1xuICAgICAgICAgICAgICAgIHkgPSB0aGlzLl9oIC8gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNtZCA9IHguc3BsaXQoJyAnKTtcbiAgICAgICAgICAgICAgICBpZiAoY21kWzBdID09PSBcInRvcFwiKSB5ID0gMDtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjbWRbMF0gPT09IFwiYm90dG9tXCIpIHkgPSB0aGlzLl9oO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNtZFswXSA9PT0gXCJtaWRkbGVcIiB8fCBjbWRbMV0gPT09IFwiY2VudGVyXCIgfHwgY21kWzFdID09PSBcImNlbnRyZVwiKSB5ID0gdGhpcy5faCAvIDI7XG5cbiAgICAgICAgICAgICAgICBpZiAoY21kWzFdID09PSBcImNlbnRlclwiIHx8IGNtZFsxXSA9PT0gXCJjZW50cmVcIiB8fCBjbWRbMV0gPT09IFwibWlkZGxlXCIpIHggPSB0aGlzLl93IC8gMjtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjbWRbMV0gPT09IFwibGVmdFwiKSB4ID0gMDtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjbWRbMV0gPT09IFwicmlnaHRcIikgeCA9IHRoaXMuX3c7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9vcmlnaW4ueCA9IHg7XG4gICAgICAgIHRoaXMuX29yaWdpbi55ID0geTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuZmxpcFxuICAgICAqIEBjb21wIDJEXG4gICAgICogQHRyaWdnZXIgSW52YWxpZGF0ZSAtIHdoZW4gdGhlIGVudGl0eSBoYXMgZmxpcHBlZFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5mbGlwKFN0cmluZyBkaXIpXG4gICAgICogQHBhcmFtIGRpciAtIEZsaXAgZGlyZWN0aW9uXG4gICAgICpcbiAgICAgKiBGbGlwIGVudGl0eSBvbiBwYXNzZWQgZGlyZWN0aW9uXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHRoaXMuZmxpcChcIlhcIilcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBmbGlwOiBmdW5jdGlvbiAoZGlyKSB7XG4gICAgICAgIGRpciA9IGRpciB8fCBcIlhcIjtcbiAgICAgICAgaWYgKCF0aGlzW1wiX2ZsaXBcIiArIGRpcl0pIHtcbiAgICAgICAgICAgIHRoaXNbXCJfZmxpcFwiICsgZGlyXSA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJJbnZhbGlkYXRlXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy51bmZsaXBcbiAgICAgKiBAY29tcCAyRFxuICAgICAqIEB0cmlnZ2VyIEludmFsaWRhdGUgLSB3aGVuIHRoZSBlbnRpdHkgaGFzIHVuZmxpcHBlZFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC51bmZsaXAoU3RyaW5nIGRpcilcbiAgICAgKiBAcGFyYW0gZGlyIC0gVW5mbGlwIGRpcmVjdGlvblxuICAgICAqXG4gICAgICogVW5mbGlwIGVudGl0eSBvbiBwYXNzZWQgZGlyZWN0aW9uIChpZiBpdCdzIGZsaXBwZWQpXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHRoaXMudW5mbGlwKFwiWFwiKVxuICAgICAqIH5+flxuICAgICAqL1xuICAgIHVuZmxpcDogZnVuY3Rpb24gKGRpcikge1xuICAgICAgICBkaXIgPSBkaXIgfHwgXCJYXCI7XG4gICAgICAgIGlmICh0aGlzW1wiX2ZsaXBcIiArIGRpcl0pIHtcbiAgICAgICAgICAgIHRoaXNbXCJfZmxpcFwiICsgZGlyXSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiSW52YWxpZGF0ZVwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTWV0aG9kIGZvciByb3RhdGlvbiByYXRoZXIgdGhhbiB0aHJvdWdoIGEgc2V0dGVyXG4gICAgICovXG4gICAgcm90YXRlOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICB2YXIgeDIsIHkyO1xuICAgICAgICB4MiA9ICAodGhpcy5feCArIHRoaXMuX29yaWdpbi54IC0gZS5vLngpICogZS5jb3MgKyAodGhpcy5feSArIHRoaXMuX29yaWdpbi55IC0gZS5vLnkpICogZS5zaW4gKyAoZS5vLnggLSB0aGlzLl9vcmlnaW4ueCk7XG4gICAgICAgIHkyID0gICh0aGlzLl95ICsgdGhpcy5fb3JpZ2luLnkgLSBlLm8ueSkgKiBlLmNvcyAtICh0aGlzLl94ICsgdGhpcy5fb3JpZ2luLnggLSBlLm8ueCkgKiBlLnNpbiArIChlLm8ueSAtIHRoaXMuX29yaWdpbi55KTtcbiAgICAgICAgdGhpcy5fYXR0cignX3JvdGF0aW9uJywgdGhpcy5fcm90YXRpb24gLSBlLmRlZyk7XG4gICAgICAgIHRoaXMuX2F0dHIoJ194JywgeDIgKTtcbiAgICAgICAgdGhpcy5fYXR0cignX3knLCB5MiApO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5fYXR0clxuICAgICAqIEBjb21wIDJEXG4gICAgICogU2V0dGVyIG1ldGhvZCBmb3IgYWxsIDJEIHByb3BlcnRpZXMgaW5jbHVkaW5nXG4gICAgICogeCwgeSwgdywgaCwgYWxwaGEsIHJvdGF0aW9uIGFuZCB2aXNpYmxlLlxuICAgICAqL1xuICAgIF9hdHRyOiBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgICAgICAgLy8gUmV0dXJuIGlmIHRoZXJlIGlzIG5vIGNoYW5nZVxuICAgICAgICBpZiAodGhpc1tuYW1lXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvL2tlZXAgYSByZWZlcmVuY2Ugb2YgdGhlIG9sZCBwb3NpdGlvbnNcbiAgICAgICAgdmFyIG9sZCA9IENyYWZ0eS5fcmVjdFBvb2wuY29weSh0aGlzKTtcblxuICAgICAgICB2YXIgbWJyO1xuICAgICAgICAvL2lmIHJvdGF0aW9uLCB1c2UgdGhlIHJvdGF0ZSBtZXRob2RcbiAgICAgICAgaWYgKG5hbWUgPT09ICdfcm90YXRpb24nKSB7XG4gICAgICAgICAgICB0aGlzLl9yb3RhdGUodmFsdWUpOyAvLyBfcm90YXRlIHRyaWdnZXJzIFwiUm90YXRlXCJcbiAgICAgICAgICAgIC8vc2V0IHRoZSBnbG9iYWwgWiBhbmQgdHJpZ2dlciByZW9yZGVyIGp1c3QgaW4gY2FzZVxuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdfeicpIHtcbiAgICAgICAgICAgIHRoaXMuX2dsb2JhbFogPSBwYXJzZUludCh2YWx1ZSArIENyYWZ0eS56ZXJvRmlsbCh0aGlzWzBdLCA1KSwgMTApOyAvL21hZ2ljIG51bWJlciAxMF41IGlzIHRoZSBtYXggbnVtIG9mIGVudGl0aWVzXG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJyZW9yZGVyXCIpO1xuICAgICAgICAgICAgLy9pZiB0aGUgcmVjdCBib3VuZHMgY2hhbmdlLCB1cGRhdGUgdGhlIE1CUiBhbmQgdHJpZ2dlciBtb3ZlXG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ194JyB8fCBuYW1lID09PSAnX3knKSB7XG4gICAgICAgICAgICAvLyBtYnIgaXMgdGhlIG1pbmltYWwgYm91bmRpbmcgcmVjdGFuZ2xlIG9mIHRoZSBlbnRpdHlcbiAgICAgICAgICAgIG1iciA9IHRoaXMuX21icjtcbiAgICAgICAgICAgIGlmIChtYnIpIHtcbiAgICAgICAgICAgICAgICBtYnJbbmFtZV0gLT0gdGhpc1tuYW1lXSAtIHZhbHVlO1xuICAgICAgICAgICAgICAgIC8vIGNiciBpcyBhIG5vbi1taW5tYWwgYm91bmRpbmcgcmVjdGFuZ2xlIHRoYXQgY29udGFpbnMgYm90aCBoaXRib3ggYW5kIG1iclxuICAgICAgICAgICAgICAgIC8vIEl0IHdpbGwgZXhpc3Qgb25seSB3aGVuIHRoZSBjb2xsaXNpb24gaGl0Ym94IHNpdHMgb3V0c2lkZSB0aGUgZW50aXR5XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2Nicil7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NicltuYW1lXSAtPSB0aGlzW25hbWVdIC0gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpc1tuYW1lXSA9IHZhbHVlO1xuXG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJNb3ZlXCIsIG9sZCk7XG5cbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAnX2gnIHx8IG5hbWUgPT09ICdfdycpIHtcbiAgICAgICAgICAgIG1iciA9IHRoaXMuX21icjtcblxuICAgICAgICAgICAgdmFyIG9sZFZhbHVlID0gdGhpc1tuYW1lXTtcbiAgICAgICAgICAgIHRoaXNbbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIGlmIChtYnIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWxjdWxhdGVNQlIoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuYW1lID09PSAnX3cnKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiUmVzaXplXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgYXhpczogJ3cnLFxuICAgICAgICAgICAgICAgICAgICBhbW91bnQ6IHZhbHVlIC0gb2xkVmFsdWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ19oJykge1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIlJlc2l6ZVwiLCB7XG4gICAgICAgICAgICAgICAgICAgIGF4aXM6ICdoJyxcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50OiB2YWx1ZSAtIG9sZFZhbHVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJNb3ZlXCIsIG9sZCk7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vZXZlcnl0aGluZyB3aWxsIGFzc3VtZSB0aGUgdmFsdWVcbiAgICAgICAgdGhpc1tuYW1lXSA9IHZhbHVlO1xuXG4gICAgICAgIC8vIGZsYWcgZm9yIHJlZHJhd1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJJbnZhbGlkYXRlXCIpO1xuXG4gICAgICAgIENyYWZ0eS5fcmVjdFBvb2wucmVjeWNsZShvbGQpO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjR3Jhdml0eVxuICogQGNhdGVnb3J5IDJEXG4gKiBAdHJpZ2dlciBNb3ZlZCAtIFdoZW4gZW50aXR5IGhhcyBtb3ZlZCBvbiB5LWF4aXMgYSBNb3ZlZCBldmVudCBpcyB0cmlnZ2VyZWQgd2l0aCBhbiBvYmplY3Qgc3BlY2lmeWluZyB0aGUgb2xkIHBvc2l0aW9uIHt4OiBvbGRfeCwgeTogb2xkX3l9XG4gKiBcbiAqIEFkZHMgZ3Jhdml0YXRpb25hbCBwdWxsIHRvIHRoZSBlbnRpdHkuXG4gKi9cbkNyYWZ0eS5jKFwiR3Jhdml0eVwiLCB7XG4gICAgX2dyYXZpdHlDb25zdDogMC4yLFxuICAgIF9neTogMCxcbiAgICBfZmFsbGluZzogdHJ1ZSxcbiAgICBfYW50aTogbnVsbCxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZXF1aXJlcyhcIjJEXCIpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5ncmF2aXR5XG4gICAgICogQGNvbXAgR3Jhdml0eVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5ncmF2aXR5KFtjb21wXSlcbiAgICAgKiBAcGFyYW0gY29tcCAtIFRoZSBuYW1lIG9mIGEgY29tcG9uZW50IHRoYXQgd2lsbCBzdG9wIHRoaXMgZW50aXR5IGZyb20gZmFsbGluZ1xuICAgICAqXG4gICAgICogRW5hYmxlIGdyYXZpdHkgZm9yIHRoaXMgZW50aXR5IG5vIG1hdHRlciB3aGV0aGVyIGNvbXAgcGFyYW1ldGVyIGlzIG5vdCBzcGVjaWZpZWQsXG4gICAgICogSWYgY29tcCBwYXJhbWV0ZXIgaXMgc3BlY2lmaWVkIGFsbCBlbnRpdGllcyB3aXRoIHRoYXQgY29tcG9uZW50IHdpbGwgc3RvcCB0aGlzIGVudGl0eSBmcm9tIGZhbGxpbmcuXG4gICAgICogRm9yIGEgcGxheWVyIGVudGl0eSBpbiBhIHBsYXRmb3JtIGdhbWUgdGhpcyB3b3VsZCBiZSBhIGNvbXBvbmVudCB0aGF0IGlzIGFkZGVkIHRvIGFsbCBlbnRpdGllc1xuICAgICAqIHRoYXQgdGhlIHBsYXllciBzaG91bGQgYmUgYWJsZSB0byB3YWxrIG9uLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIjJELCBET00sIENvbG9yLCBHcmF2aXR5XCIpXG4gICAgICogICAuY29sb3IoXCJyZWRcIilcbiAgICAgKiAgIC5hdHRyKHsgdzogMTAwLCBoOiAxMDAgfSlcbiAgICAgKiAgIC5ncmF2aXR5KFwicGxhdGZvcm1cIik7XG4gICAgICogfn5+XG4gICAgICovXG4gICAgZ3Jhdml0eTogZnVuY3Rpb24gKGNvbXApIHtcbiAgICAgICAgaWYgKGNvbXApIHRoaXMuX2FudGkgPSBjb21wO1xuICAgICAgICBpZihpc05hTih0aGlzLl9qdW1wU3BlZWQpKSB0aGlzLl9qdW1wU3BlZWQgPSAwOyAvL3NldCB0byAwIGlmIFR3b3dheSBjb21wb25lbnQgaXMgbm90IHByZXNlbnRcblxuICAgICAgICB0aGlzLmJpbmQoXCJFbnRlckZyYW1lXCIsIHRoaXMuX2VudGVyRnJhbWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5ncmF2aXR5Q29uc3RcbiAgICAgKiBAY29tcCBHcmF2aXR5XG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmdyYXZpdHlDb25zdChnKVxuICAgICAqIEBwYXJhbSBnIC0gZ3Jhdml0YXRpb25hbCBjb25zdGFudFxuICAgICAqXG4gICAgICogU2V0IHRoZSBncmF2aXRhdGlvbmFsIGNvbnN0YW50IHRvIGcuIFRoZSBkZWZhdWx0IGlzIC4yLiBUaGUgZ3JlYXRlciBnLCB0aGUgZmFzdGVyIHRoZSBvYmplY3QgZmFsbHMuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiMkQsIERPTSwgQ29sb3IsIEdyYXZpdHlcIilcbiAgICAgKiAgIC5jb2xvcihcInJlZFwiKVxuICAgICAqICAgLmF0dHIoeyB3OiAxMDAsIGg6IDEwMCB9KVxuICAgICAqICAgLmdyYXZpdHkoXCJwbGF0Zm9ybVwiKVxuICAgICAqICAgLmdyYXZpdHlDb25zdCgyKVxuICAgICAqIH5+flxuICAgICAqL1xuICAgIGdyYXZpdHlDb25zdDogZnVuY3Rpb24gKGcpIHtcbiAgICAgICAgdGhpcy5fZ3Jhdml0eUNvbnN0ID0gZztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9lbnRlckZyYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9mYWxsaW5nKSB7XG4gICAgICAgICAgICAvL2lmIGZhbGxpbmcsIG1vdmUgdGhlIHBsYXllcnMgWVxuICAgICAgICAgICAgdGhpcy5fZ3kgKz0gdGhpcy5fZ3Jhdml0eUNvbnN0O1xuICAgICAgICAgICAgdGhpcy55ICs9IHRoaXMuX2d5O1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdNb3ZlZCcsIHsgeDogdGhpcy5feCwgeTogdGhpcy5feSAtIHRoaXMuX2d5IH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fZ3kgPSAwOyAvL3Jlc2V0IGNoYW5nZSBpbiB5XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb2JqLCBoaXQgPSBmYWxzZSxcbiAgICAgICAgICAgIHBvcyA9IHRoaXMucG9zKCksXG4gICAgICAgICAgICBxLCBpID0gMCxcbiAgICAgICAgICAgIGw7XG5cbiAgICAgICAgLy9JbmNyZWFzZSBieSAxIHRvIG1ha2Ugc3VyZSBtYXAuc2VhcmNoKCkgZmluZHMgdGhlIGZsb29yXG4gICAgICAgIHBvcy5feSsrO1xuXG4gICAgICAgIC8vbWFwLnNlYXJjaCB3YW50cyBfeCBhbmQgaW50ZXJzZWN0IHdhbnRzIHguLi5cbiAgICAgICAgcG9zLnggPSBwb3MuX3g7XG4gICAgICAgIHBvcy55ID0gcG9zLl95O1xuICAgICAgICBwb3MudyA9IHBvcy5fdztcbiAgICAgICAgcG9zLmggPSBwb3MuX2g7XG5cbiAgICAgICAgcSA9IENyYWZ0eS5tYXAuc2VhcmNoKHBvcyk7XG4gICAgICAgIGwgPSBxLmxlbmd0aDtcblxuICAgICAgICBmb3IgKDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgb2JqID0gcVtpXTtcbiAgICAgICAgICAgIC8vY2hlY2sgZm9yIGFuIGludGVyc2VjdGlvbiBkaXJlY3RseSBiZWxvdyB0aGUgcGxheWVyXG4gICAgICAgICAgICBpZiAob2JqICE9PSB0aGlzICYmIG9iai5oYXModGhpcy5fYW50aSkgJiYgb2JqLmludGVyc2VjdChwb3MpKSB7XG4gICAgICAgICAgICAgICAgaGl0ID0gb2JqO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhpdCkgeyAvL3N0b3AgZmFsbGluZyBpZiBmb3VuZCBhbmQgcGxheWVyIGlzIG1vdmluZyBkb3duXG4gICAgICAgICAgICBpZiAodGhpcy5fZmFsbGluZyAmJiAoKHRoaXMuX2d5ID4gdGhpcy5fanVtcFNwZWVkKSB8fCAhdGhpcy5fdXApKXtcbiAgICAgICAgICAgICAgdGhpcy5zdG9wRmFsbGluZyhoaXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fZmFsbGluZyA9IHRydWU7IC8va2VlcCBmYWxsaW5nIG90aGVyd2lzZVxuICAgICAgICB9XG4gICAgfSxcblxuICAgIHN0b3BGYWxsaW5nOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICBpZiAoZSkgdGhpcy55ID0gZS5feSAtIHRoaXMuX2g7IC8vbW92ZSBvYmplY3RcblxuICAgICAgICAvL3RoaXMuX2d5ID0gLTEgKiB0aGlzLl9ib3VuY2U7XG4gICAgICAgIHRoaXMuX2ZhbGxpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuX3VwKSB0aGlzLl91cCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJoaXRcIik7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmFudGlncmF2aXR5XG4gICAgICogQGNvbXAgR3Jhdml0eVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5hbnRpZ3Jhdml0eSgpXG4gICAgICogRGlzYWJsZSBncmF2aXR5IGZvciB0aGlzIGNvbXBvbmVudC4gSXQgY2FuIGJlIHJlZW5hYmxlZCBieSBjYWxsaW5nIC5ncmF2aXR5KClcbiAgICAgKi9cbiAgICBhbnRpZ3Jhdml0eTogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnVuYmluZChcIkVudGVyRnJhbWVcIiwgdGhpcy5fZW50ZXJGcmFtZSk7XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICNDcmFmdHkucG9seWdvblxuICogQGNhdGVnb3J5IDJEXG4gKlxuICogUG9seWdvbiBvYmplY3QgdXNlZCBmb3IgaGl0Ym94ZXMgYW5kIGNsaWNrIG1hcHMuIE11c3QgcGFzcyBhbiBBcnJheSBmb3IgZWFjaCBwb2ludCBhcyBhblxuICogYXJndW1lbnQgd2hlcmUgaW5kZXggMCBpcyB0aGUgeCBwb3NpdGlvbiBhbmQgaW5kZXggMSBpcyB0aGUgeSBwb3NpdGlvbi5cbiAqXG4gKiBGb3IgZXhhbXBsZSBvbmUgcG9pbnQgb2YgYSBwb2x5Z29uIHdpbGwgbG9vayBsaWtlIHRoaXM6IGBbMCw1XWAgd2hlcmUgdGhlIGB4YCBpcyBgMGAgYW5kIHRoZSBgeWAgaXMgYDVgLlxuICpcbiAqIENhbiBwYXNzIGFuIGFycmF5IG9mIHRoZSBwb2ludHMgb3Igc2ltcGx5IHB1dCBlYWNoIHBvaW50IGFzIGFuIGFyZ3VtZW50LlxuICpcbiAqIFdoZW4gY3JlYXRpbmcgYSBwb2x5Z29uIGZvciBhbiBlbnRpdHksIGVhY2ggcG9pbnQgc2hvdWxkIGJlIG9mZnNldCBvciByZWxhdGl2ZSBmcm9tIHRoZSBlbnRpdGllcyBgeGAgYW5kIGB5YFxuICogKGRvbid0IGluY2x1ZGUgdGhlIGFic29sdXRlIHZhbHVlcyBhcyBpdCB3aWxsIGF1dG9tYXRpY2FsbHkgY2FsY3VsYXRlIHRoaXMpLlxuICpcbiAqXG4gKiBAZXhhbXBsZVxuICogfn5+XG4gKiBuZXcgQ3JhZnR5LnBvbHlnb24oWzUwLDBdLFsxMDAsMTAwXSxbMCwxMDBdKTtcbiAqIG5ldyBDcmFmdHkucG9seWdvbihbWzUwLDBdLFsxMDAsMTAwXSxbMCwxMDBdXSk7XG4gKiB+fn5cbiAqL1xuQ3JhZnR5LnBvbHlnb24gPSBmdW5jdGlvbiAocG9seSkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBwb2x5ID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcbiAgICB9XG4gICAgdGhpcy5wb2ludHMgPSBwb2x5O1xufTtcblxuQ3JhZnR5LnBvbHlnb24ucHJvdG90eXBlID0ge1xuICAgIC8qKkBcbiAgICAgKiAjLmNvbnRhaW5zUG9pbnRcbiAgICAgKiBAY29tcCBDcmFmdHkucG9seWdvblxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIC5jb250YWluc1BvaW50KE51bWJlciB4LCBOdW1iZXIgeSlcbiAgICAgKiBAcGFyYW0geCAtIFggcG9zaXRpb24gb2YgdGhlIHBvaW50XG4gICAgICogQHBhcmFtIHkgLSBZIHBvc2l0aW9uIG9mIHRoZSBwb2ludFxuICAgICAqXG4gICAgICogTWV0aG9kIGlzIHVzZWQgdG8gZGV0ZXJtaW5lIGlmIGEgZ2l2ZW4gcG9pbnQgaXMgY29udGFpbmVkIGJ5IHRoZSBwb2x5Z29uLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgcG9seSA9IG5ldyBDcmFmdHkucG9seWdvbihbNTAsMF0sWzEwMCwxMDBdLFswLDEwMF0pO1xuICAgICAqIHBvbHkuY29udGFpbnNQb2ludCg1MCwgNTApOyAvL1RSVUVcbiAgICAgKiBwb2x5LmNvbnRhaW5zUG9pbnQoMCwgMCk7IC8vRkFMU0VcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBjb250YWluc1BvaW50OiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucG9pbnRzLFxuICAgICAgICAgICAgaSwgaiwgYyA9IGZhbHNlO1xuXG4gICAgICAgIGZvciAoaSA9IDAsIGogPSBwLmxlbmd0aCAtIDE7IGkgPCBwLmxlbmd0aDsgaiA9IGkrKykge1xuICAgICAgICAgICAgaWYgKCgocFtpXVsxXSA+IHkpICE9IChwW2pdWzFdID4geSkpICYmICh4IDwgKHBbal1bMF0gLSBwW2ldWzBdKSAqICh5IC0gcFtpXVsxXSkgLyAocFtqXVsxXSAtIHBbaV1bMV0pICsgcFtpXVswXSkpIHtcbiAgICAgICAgICAgICAgICBjID0gIWM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuc2hpZnRcbiAgICAgKiBAY29tcCBDcmFmdHkucG9seWdvblxuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIC5zaGlmdChOdW1iZXIgeCwgTnVtYmVyIHkpXG4gICAgICogQHBhcmFtIHggLSBBbW91bnQgdG8gc2hpZnQgdGhlIGB4YCBheGlzXG4gICAgICogQHBhcmFtIHkgLSBBbW91bnQgdG8gc2hpZnQgdGhlIGB5YCBheGlzXG4gICAgICpcbiAgICAgKiBTaGlmdHMgZXZlcnkgc2luZ2xlIHBvaW50IGluIHRoZSBwb2x5Z29uIGJ5IHRoZSBzcGVjaWZpZWQgYW1vdW50LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgcG9seSA9IG5ldyBDcmFmdHkucG9seWdvbihbNTAsMF0sWzEwMCwxMDBdLFswLDEwMF0pO1xuICAgICAqIHBvbHkuc2hpZnQoNSw1KTtcbiAgICAgKiAvL1tbNTUsNV0sIFsxMDUsNV0sIFs1LDEwNV1dO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIHNoaWZ0OiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICB2YXIgaSA9IDAsXG4gICAgICAgICAgICBsID0gdGhpcy5wb2ludHMubGVuZ3RoLFxuICAgICAgICAgICAgY3VycmVudDtcbiAgICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIGN1cnJlbnQgPSB0aGlzLnBvaW50c1tpXTtcbiAgICAgICAgICAgIGN1cnJlbnRbMF0gKz0geDtcbiAgICAgICAgICAgIGN1cnJlbnRbMV0gKz0geTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByb3RhdGU6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgIGwgPSB0aGlzLnBvaW50cy5sZW5ndGgsXG4gICAgICAgICAgICBjdXJyZW50LCB4LCB5O1xuXG4gICAgICAgIGZvciAoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBjdXJyZW50ID0gdGhpcy5wb2ludHNbaV07XG5cbiAgICAgICAgICAgIHggPSBlLm8ueCArIChjdXJyZW50WzBdIC0gZS5vLngpICogZS5jb3MgKyAoY3VycmVudFsxXSAtIGUuby55KSAqIGUuc2luO1xuICAgICAgICAgICAgeSA9IGUuby55IC0gKGN1cnJlbnRbMF0gLSBlLm8ueCkgKiBlLnNpbiArIChjdXJyZW50WzFdIC0gZS5vLnkpICogZS5jb3M7XG5cbiAgICAgICAgICAgIGN1cnJlbnRbMF0gPSB4O1xuICAgICAgICAgICAgY3VycmVudFsxXSA9IHk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vKipAXG4gKiAjQ3JhZnR5LmNpcmNsZVxuICogQGNhdGVnb3J5IDJEXG4gKiBDaXJjbGUgb2JqZWN0IHVzZWQgZm9yIGhpdGJveGVzIGFuZCBjbGljayBtYXBzLiBNdXN0IHBhc3MgYSBgeGAsIGEgYHlgIGFuZCBhIGByYWRpdXNgIHZhbHVlLlxuICpcbiAqQGV4YW1wbGVcbiAqIH5+flxuICogdmFyIGNlbnRlclggPSA1LFxuICogICAgIGNlbnRlclkgPSAxMCxcbiAqICAgICByYWRpdXMgPSAyNTtcbiAqXG4gKiBuZXcgQ3JhZnR5LmNpcmNsZShjZW50ZXJYLCBjZW50ZXJZLCByYWRpdXMpO1xuICogfn5+XG4gKlxuICogV2hlbiBjcmVhdGluZyBhIGNpcmNsZSBmb3IgYW4gZW50aXR5LCBlYWNoIHBvaW50IHNob3VsZCBiZSBvZmZzZXQgb3IgcmVsYXRpdmUgZnJvbSB0aGUgZW50aXRpZXMgYHhgIGFuZCBgeWBcbiAqIChkb24ndCBpbmNsdWRlIHRoZSBhYnNvbHV0ZSB2YWx1ZXMgYXMgaXQgd2lsbCBhdXRvbWF0aWNhbGx5IGNhbGN1bGF0ZSB0aGlzKS5cbiAqL1xuQ3JhZnR5LmNpcmNsZSA9IGZ1bmN0aW9uICh4LCB5LCByYWRpdXMpIHtcbiAgICB0aGlzLnggPSB4O1xuICAgIHRoaXMueSA9IHk7XG4gICAgdGhpcy5yYWRpdXMgPSByYWRpdXM7XG5cbiAgICAvLyBDcmVhdGVzIGFuIG9jdGFnb24gdGhhdCBhcHByb3hpbWF0ZSB0aGUgY2lyY2xlIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LlxuICAgIHRoaXMucG9pbnRzID0gW107XG4gICAgdmFyIHRoZXRhO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA4OyBpKyspIHtcbiAgICAgICAgdGhldGEgPSBpICogTWF0aC5QSSAvIDQ7XG4gICAgICAgIHRoaXMucG9pbnRzW2ldID0gW3RoaXMueCArIChNYXRoLnNpbih0aGV0YSkgKiByYWRpdXMpLCB0aGlzLnkgKyAoTWF0aC5jb3ModGhldGEpICogcmFkaXVzKV07XG4gICAgfVxufTtcblxuQ3JhZnR5LmNpcmNsZS5wcm90b3R5cGUgPSB7XG4gICAgLyoqQFxuICAgICAqICMuY29udGFpbnNQb2ludFxuICAgICAqIEBjb21wIENyYWZ0eS5jaXJjbGVcbiAgICAgKiBAc2lnbiBwdWJsaWMgQm9vbGVhbiAuY29udGFpbnNQb2ludChOdW1iZXIgeCwgTnVtYmVyIHkpXG4gICAgICogQHBhcmFtIHggLSBYIHBvc2l0aW9uIG9mIHRoZSBwb2ludFxuICAgICAqIEBwYXJhbSB5IC0gWSBwb3NpdGlvbiBvZiB0aGUgcG9pbnRcbiAgICAgKlxuICAgICAqIE1ldGhvZCBpcyB1c2VkIHRvIGRldGVybWluZSBpZiBhIGdpdmVuIHBvaW50IGlzIGNvbnRhaW5lZCBieSB0aGUgY2lyY2xlLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgY2lyY2xlID0gbmV3IENyYWZ0eS5jaXJjbGUoMCwgMCwgMTApO1xuICAgICAqIGNpcmNsZS5jb250YWluc1BvaW50KDAsIDApOyAvL1RSVUVcbiAgICAgKiBjaXJjbGUuY29udGFpbnNQb2ludCg1MCwgNTApOyAvL0ZBTFNFXG4gICAgICogfn5+XG4gICAgICovXG4gICAgY29udGFpbnNQb2ludDogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgdmFyIHJhZGl1cyA9IHRoaXMucmFkaXVzLFxuICAgICAgICAgICAgc3FydCA9IE1hdGguc3FydCxcbiAgICAgICAgICAgIGRlbHRhWCA9IHRoaXMueCAtIHgsXG4gICAgICAgICAgICBkZWx0YVkgPSB0aGlzLnkgLSB5O1xuXG4gICAgICAgIHJldHVybiAoZGVsdGFYICogZGVsdGFYICsgZGVsdGFZICogZGVsdGFZKSA8IChyYWRpdXMgKiByYWRpdXMpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5zaGlmdFxuICAgICAqIEBjb21wIENyYWZ0eS5jaXJjbGVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCAuc2hpZnQoTnVtYmVyIHgsIE51bWJlciB5KVxuICAgICAqIEBwYXJhbSB4IC0gQW1vdW50IHRvIHNoaWZ0IHRoZSBgeGAgYXhpc1xuICAgICAqIEBwYXJhbSB5IC0gQW1vdW50IHRvIHNoaWZ0IHRoZSBgeWAgYXhpc1xuICAgICAqXG4gICAgICogU2hpZnRzIHRoZSBjaXJjbGUgYnkgdGhlIHNwZWNpZmllZCBhbW91bnQuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHZhciBjaXJjbGUgPSBuZXcgQ3JhZnR5LmNpcmNsZSgwLCAwLCAxMCk7XG4gICAgICogY2lyY2xlLnNoaWZ0KDUsNSk7XG4gICAgICogLy97eDogNSwgeTogNSwgcmFkaXVzOiAxMH07XG4gICAgICogfn5+XG4gICAgICovXG4gICAgc2hpZnQ6IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIHRoaXMueCArPSB4O1xuICAgICAgICB0aGlzLnkgKz0geTtcblxuICAgICAgICB2YXIgaSA9IDAsXG4gICAgICAgICAgICBsID0gdGhpcy5wb2ludHMubGVuZ3RoLFxuICAgICAgICAgICAgY3VycmVudDtcbiAgICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIGN1cnJlbnQgPSB0aGlzLnBvaW50c1tpXTtcbiAgICAgICAgICAgIGN1cnJlbnRbMF0gKz0geDtcbiAgICAgICAgICAgIGN1cnJlbnRbMV0gKz0geTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICByb3RhdGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gV2UgYXJlIGEgY2lyY2xlLCB3ZSBkb24ndCBoYXZlIHRvIHJvdGF0ZSA6KVxuICAgIH1cbn07XG5cblxuQ3JhZnR5Lm1hdHJpeCA9IGZ1bmN0aW9uIChtKSB7XG4gICAgdGhpcy5tdHggPSBtO1xuICAgIHRoaXMud2lkdGggPSBtWzBdLmxlbmd0aDtcbiAgICB0aGlzLmhlaWdodCA9IG0ubGVuZ3RoO1xufTtcblxuQ3JhZnR5Lm1hdHJpeC5wcm90b3R5cGUgPSB7XG4gICAgeDogZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgICAgIGlmICh0aGlzLndpZHRoICE9IG90aGVyLmhlaWdodCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuaGVpZ2h0OyBpKyspIHtcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBvdGhlci53aWR0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN1bSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCB0aGlzLndpZHRoOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgc3VtICs9IHRoaXMubXR4W2ldW2tdICogb3RoZXIubXR4W2tdW2pdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXN1bHRbaV1bal0gPSBzdW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBDcmFmdHkubWF0cml4KHJlc3VsdCk7XG4gICAgfSxcblxuXG4gICAgZTogZnVuY3Rpb24gKHJvdywgY29sKSB7XG4gICAgICAgIC8vdGVzdCBpZiBvdXQgb2YgYm91bmRzXG4gICAgICAgIGlmIChyb3cgPCAxIHx8IHJvdyA+IHRoaXMubXR4Lmxlbmd0aCB8fCBjb2wgPCAxIHx8IGNvbCA+IHRoaXMubXR4WzBdLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgICAgIHJldHVybiB0aGlzLm10eFtyb3cgLSAxXVtjb2wgLSAxXTtcbiAgICB9XG59O1xuIiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG4vKipcbiAqIFNwYXRpYWwgSGFzaE1hcCBmb3IgYnJvYWQgcGhhc2UgY29sbGlzaW9uXG4gKlxuICogQGF1dGhvciBMb3VpcyBTdG93YXNzZXJcbiAqL1xuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuSGFzaE1hcC5jb25zdHJ1Y3RvclxuICAgICAqIEBjb21wIENyYWZ0eS5IYXNoTWFwXG4gICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5Lkhhc2hNYXAoW2NlbGxzaXplXSlcbiAgICAgKiBAcGFyYW0gY2VsbHNpemUgLSB0aGUgY2VsbCBzaXplLiBJZiBvbWl0dGVkLCBgY2VsbHNpemVgIGlzIDY0LlxuICAgICAqXG4gICAgICogU2V0IGBjZWxsc2l6ZWAuXG4gICAgICogQW5kIGNyZWF0ZSBgdGhpcy5tYXBgLlxuICAgICAqL1xuICAgIHZhciBjZWxsc2l6ZSxcblxuICAgICAgICBIYXNoTWFwID0gZnVuY3Rpb24gKGNlbGwpIHtcbiAgICAgICAgICAgIGNlbGxzaXplID0gY2VsbCB8fCA2NDtcbiAgICAgICAgICAgIHRoaXMubWFwID0ge307XG4gICAgICAgIH0sXG5cbiAgICAgICAgU1BBQ0UgPSBcIiBcIixcbiAgICAgICAga2V5SG9sZGVyID0ge307XG5cbiAgICBIYXNoTWFwLnByb3RvdHlwZSA9IHtcbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5Lm1hcC5pbnNlcnRcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5Lm1hcFxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgT2JqZWN0IENyYWZ0eS5tYXAuaW5zZXJ0KE9iamVjdCBvYmopXG4gICAgICAgICAqIEBwYXJhbSBvYmogLSBBbiBlbnRpdHkgdG8gYmUgaW5zZXJ0ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIGBvYmpgIGlzIGluc2VydGVkIGluICcubWFwJyBvZiB0aGUgY29ycmVzcG9uZGluZyBicm9hZCBwaGFzZSBjZWxscy4gQW4gb2JqZWN0IG9mIHRoZSBmb2xsb3dpbmcgZmllbGRzIGlzIHJldHVybmVkLlxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogLSB0aGUgb2JqZWN0IHRoYXQga2VlcCB0cmFjayBvZiBjZWxscyAoa2V5cylcbiAgICAgICAgICogLSBgb2JqYFxuICAgICAgICAgKiAtIHRoZSBIYXNoTWFwIG9iamVjdFxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIGluc2VydDogZnVuY3Rpb24gKG9iaikge1xuICAgICAgICAgICAgdmFyIGtleXMgPSBIYXNoTWFwLmtleShvYmopLFxuICAgICAgICAgICAgICAgIGVudHJ5ID0gbmV3IEVudHJ5KGtleXMsIG9iaiwgdGhpcyksXG4gICAgICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICAgICAgaixcbiAgICAgICAgICAgICAgICBoYXNoO1xuXG4gICAgICAgICAgICAvL2luc2VydCBpbnRvIGFsbCB4IGJ1Y2tldHNcbiAgICAgICAgICAgIGZvciAoaSA9IGtleXMueDE7IGkgPD0ga2V5cy54MjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLy9pbnNlcnQgaW50byBhbGwgeSBidWNrZXRzXG4gICAgICAgICAgICAgICAgZm9yIChqID0ga2V5cy55MTsgaiA8PSBrZXlzLnkyOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaGFzaCA9IChpIDw8IDE2KSBeIGo7XG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5tYXBbaGFzaF0pIHRoaXMubWFwW2hhc2hdID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWFwW2hhc2hdLnB1c2gob2JqKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBlbnRyeTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkubWFwLnNlYXJjaFxuICAgICAgICAgKiBAY29tcCBDcmFmdHkubWFwXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBPYmplY3QgQ3JhZnR5Lm1hcC5zZWFyY2goT2JqZWN0IHJlY3RbLCBCb29sZWFuIGZpbHRlcl0pXG4gICAgICAgICAqIEBwYXJhbSByZWN0IC0gdGhlIHJlY3Rhbmd1bGFyIHJlZ2lvbiB0byBzZWFyY2ggZm9yIGVudGl0aWVzLlxuICAgICAgICAgKiBAcGFyYW0gZmlsdGVyIC0gRGVmYXVsdCB2YWx1ZSBpcyB0cnVlLiBPdGhlcndpc2UsIG11c3QgYmUgZmFsc2UuXG4gICAgICAgICAqXG4gICAgICAgICAqIC0gSWYgYGZpbHRlcmAgaXMgYGZhbHNlYCwganVzdCBzZWFyY2ggZm9yIGFsbCB0aGUgZW50cmllcyBpbiB0aGUgZ2l2ZSBgcmVjdGAgcmVnaW9uIGJ5IGJyb2FkIHBoYXNlIGNvbGxpc2lvbi4gRW50aXR5IG1heSBiZSByZXR1cm5lZCBkdXBsaWNhdGVkLlxuICAgICAgICAgKiAtIElmIGBmaWx0ZXJgIGlzIGB0cnVlYCwgZmlsdGVyIHRoZSBhYm92ZSByZXN1bHRzIGJ5IGNoZWNraW5nIHRoYXQgdGhleSBhY3R1YWxseSBvdmVybGFwIGByZWN0YC5cbiAgICAgICAgICogVGhlIGVhc2llciB1c2FnZSBpcyB3aXRoIGBmaWx0ZXJgPWB0cnVlYC4gRm9yIHBlcmZvcm1hbmNlIHJlYXNvbiwgeW91IG1heSB1c2UgYGZpbHRlcmA9YGZhbHNlYCwgYW5kIGZpbHRlciB0aGUgcmVzdWx0IHlvdXJzZWxmLiBTZWUgZXhhbXBsZXMgaW4gZHJhd2luZy5qcyBhbmQgY29sbGlzaW9uLmpzXG4gICAgICAgICAqL1xuXG4gICAgICAgIHNlYXJjaDogZnVuY3Rpb24gKHJlY3QsIGZpbHRlcikge1xuICAgICAgICAgICAgdmFyIGtleXMgPSBIYXNoTWFwLmtleShyZWN0LCBrZXlIb2xkZXIpLFxuICAgICAgICAgICAgICAgIGksIGosIGssXG4gICAgICAgICAgICAgICAgcmVzdWx0cyA9IFtdO1xuXG4gICAgICAgICAgICBpZiAoZmlsdGVyID09PSB1bmRlZmluZWQpIGZpbHRlciA9IHRydWU7IC8vZGVmYXVsdCBmaWx0ZXIgdG8gdHJ1ZVxuXG4gICAgICAgICAgICAvL3NlYXJjaCBpbiBhbGwgeCBidWNrZXRzXG4gICAgICAgICAgICBmb3IgKGkgPSBrZXlzLngxOyBpIDw9IGtleXMueDI7IGkrKykge1xuICAgICAgICAgICAgICAgIC8vaW5zZXJ0IGludG8gYWxsIHkgYnVja2V0c1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGtleXMueTE7IGogPD0ga2V5cy55MjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNlbGwgPSB0aGlzLm1hcFsoaSA8PCAxNikgXiBqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBjZWxsLmxlbmd0aDsgaysrKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChjZWxsW2tdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGZpbHRlcikge1xuICAgICAgICAgICAgICAgIHZhciBvYmosIGlkLCBmaW5hbHJlc3VsdCA9IFtdLFxuICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vYWRkIHVuaXF1ZSBlbGVtZW50cyB0byBsb29rdXAgdGFibGUgd2l0aCB0aGUgZW50aXR5IElEIGFzIHVuaXF1ZSBrZXlcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwLCBsID0gcmVzdWx0cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gcmVzdWx0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvYmopIGNvbnRpbnVlOyAvL3NraXAgaWYgZGVsZXRlZFxuICAgICAgICAgICAgICAgICAgICBpZCA9IG9ialswXTsgLy91bmlxdWUgSURcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gb2JqLl9tYnIgfHwgb2JqO1xuICAgICAgICAgICAgICAgICAgICAvL2NoZWNrIGlmIG5vdCBhZGRlZCB0byBoYXNoIGFuZCB0aGF0IGFjdHVhbGx5IGludGVyc2VjdHNcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZFtpZF0gJiYgb2JqLl94IDwgcmVjdC5feCArIHJlY3QuX3cgJiYgb2JqLl94ICsgb2JqLl93ID4gcmVjdC5feCAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqLl95IDwgcmVjdC5feSArIHJlY3QuX2ggJiYgb2JqLl9oICsgb2JqLl95ID4gcmVjdC5feSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kW2lkXSA9IHJlc3VsdHNbaV07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9sb29wIG92ZXIgbG9va3VwIHRhYmxlIGFuZCBjb3B5IHRvIGZpbmFsIGFycmF5XG4gICAgICAgICAgICAgICAgZm9yIChvYmogaW4gZm91bmQpIGZpbmFscmVzdWx0LnB1c2goZm91bmRbb2JqXSk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZmluYWxyZXN1bHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5tYXAucmVtb3ZlXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5tYXBcbiAgICAgICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5Lm1hcC5yZW1vdmUoW09iamVjdCBrZXlzLCBdT2JqZWN0IG9iailcbiAgICAgICAgICogQHBhcmFtIGtleXMgLSBrZXkgcmVnaW9uLiBJZiBvbWl0dGVkLCBpdCB3aWxsIGJlIGRlcml2ZWQgZnJvbSBvYmogYnkgYENyYWZ0eS5IYXNoTWFwLmtleWAuXG4gICAgICAgICAqIEBwYXJhbSBvYmogLSBuZWVkIG1vcmUgZG9jdW1lbnQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlbW92ZSBhbiBlbnRpdHkgaW4gYSBicm9hZCBwaGFzZSBtYXAuXG4gICAgICAgICAqIC0gVGhlIHNlY29uZCBmb3JtIGlzIG9ubHkgdXNlZCBpbiBDcmFmdHkuSGFzaE1hcCB0byBzYXZlIHRpbWUgZm9yIGNvbXB1dGluZyBrZXlzIGFnYWluLCB3aGVyZSBrZXlzIHdlcmUgY29tcHV0ZWQgcHJldmlvdXNseSBmcm9tIG9iai4gRW5kIHVzZXJzIHNob3VsZCBub3QgY2FsbCB0aGlzIGZvcm0gZGlyZWN0bHkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkubWFwLnJlbW92ZShlKTtcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmU6IGZ1bmN0aW9uIChrZXlzLCBvYmopIHtcbiAgICAgICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgICAgICBqLCBoYXNoO1xuXG4gICAgICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgb2JqID0ga2V5cztcbiAgICAgICAgICAgICAgICBrZXlzID0gSGFzaE1hcC5rZXkob2JqLCBrZXlIb2xkZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3NlYXJjaCBpbiBhbGwgeCBidWNrZXRzXG4gICAgICAgICAgICBmb3IgKGkgPSBrZXlzLngxOyBpIDw9IGtleXMueDI7IGkrKykge1xuICAgICAgICAgICAgICAgIC8vaW5zZXJ0IGludG8gYWxsIHkgYnVja2V0c1xuICAgICAgICAgICAgICAgIGZvciAoaiA9IGtleXMueTE7IGogPD0ga2V5cy55MjsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGhhc2ggPSAoaSA8PCAxNikgXiBqO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm1hcFtoYXNoXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNlbGwgPSB0aGlzLm1hcFtoYXNoXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtLCBuID0gY2VsbC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2xvb3Agb3ZlciBvYmpzIGluIGNlbGwgYW5kIGRlbGV0ZVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChtID0gMDsgbSA8IG47IG0rKylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbFttXSAmJiBjZWxsW21dWzBdID09PSBvYmpbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuc3BsaWNlKG0sIDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5tYXAucmVmcmVzaFxuICAgICAgICAgKiBAY29tcCBDcmFmdHkubWFwXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5tYXAucmVtb3ZlKEVudHJ5IGVudHJ5KVxuICAgICAgICAgKiBAcGFyYW0gZW50cnkgLSBBbiBlbnRyeSB0byB1cGRhdGVcbiAgICAgICAgICpcbiAgICAgICAgICogUmVmcmVzaCBhbiBlbnRyeSdzIGtleXMsIGFuZCBpdHMgcG9zaXRpb24gaW4gdGhlIGJyb2FkIHBocmFzZSBtYXAuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkubWFwLnJlZnJlc2goZSk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKi9cbiAgICAgICAgcmVmcmVzaDogZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgICAgICAgICB2YXIga2V5cyA9IGVudHJ5LmtleXM7XG4gICAgICAgICAgICB2YXIgb2JqID0gZW50cnkub2JqO1xuICAgICAgICAgICAgdmFyIGNlbGwsIGksIGosIG0sIG47XG5cbiAgICAgICAgICAgIC8vRmlyc3QgZGVsZXRlIGN1cnJlbnQgb2JqZWN0IGZyb20gYXBwcm9wcmlhdGUgY2VsbHNcbiAgICAgICAgICAgIGZvciAoaSA9IGtleXMueDE7IGkgPD0ga2V5cy54MjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChqID0ga2V5cy55MTsgaiA8PSBrZXlzLnkyOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbCA9IHRoaXMubWFwWyhpIDw8IDE2KSBeIGpdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbiA9IGNlbGwubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9sb29wIG92ZXIgb2JqcyBpbiBjZWxsIGFuZCBkZWxldGVcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobSA9IDA7IG0gPCBuOyBtKyspXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGxbbV0gJiYgY2VsbFttXVswXSA9PT0gb2JqWzBdKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjZWxsLnNwbGljZShtLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy91cGRhdGUga2V5c1xuICAgICAgICAgICAgSGFzaE1hcC5rZXkob2JqLCBrZXlzKTtcblxuICAgICAgICAgICAgLy9pbnNlcnQgaW50byBhbGwgcm93cyBhbmQgY29sdW1uc1xuICAgICAgICAgICAgZm9yIChpID0ga2V5cy54MTsgaSA8PSBrZXlzLngyOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGogPSBrZXlzLnkxOyBqIDw9IGtleXMueTI7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjZWxsID0gdGhpcy5tYXBbKGkgPDwgMTYpIF4gal07XG4gICAgICAgICAgICAgICAgICAgIGlmICghY2VsbCkgY2VsbCA9IHRoaXMubWFwWyhpIDw8IDE2KSBeIGpdID0gW107XG4gICAgICAgICAgICAgICAgICAgIGNlbGwucHVzaChvYmopO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgICAgICB9LFxuXG5cblxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5tYXAuYm91bmRhcmllc1xuICAgICAgICAgKiBAY29tcCBDcmFmdHkubWFwXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBPYmplY3QgQ3JhZnR5Lm1hcC5ib3VuZGFyaWVzKClcbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIHJldHVybiBgT2JqZWN0YCBpcyBvZiB0aGUgZm9sbG93aW5nIGZvcm1hdC5cbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHtcbiAgICAgICAgICogICBtaW46IHtcbiAgICAgICAgICogICAgIHg6IHZhbF94LFxuICAgICAgICAgKiAgICAgeTogdmFsX3lcbiAgICAgICAgICogICB9LFxuICAgICAgICAgKiAgIG1heDoge1xuICAgICAgICAgKiAgICAgeDogdmFsX3gsXG4gICAgICAgICAqICAgICB5OiB2YWxfeVxuICAgICAgICAgKiAgIH1cbiAgICAgICAgICogfVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIGJvdW5kYXJpZXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBrLCBlbnQsXG4gICAgICAgICAgICAgICAgaGFzaCA9IHtcbiAgICAgICAgICAgICAgICAgICAgbWF4OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiAtSW5maW5pdHksXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiAtSW5maW5pdHlcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgbWluOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IEluZmluaXR5XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGNvb3JkcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbWF4OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiAtSW5maW5pdHksXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiAtSW5maW5pdHlcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgbWluOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IEluZmluaXR5XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvL1VzaW5nIGJyb2FkIHBoYXNlIGhhc2ggdG8gc3BlZWQgdXAgdGhlIGNvbXB1dGF0aW9uIG9mIGJvdW5kYXJpZXMuXG4gICAgICAgICAgICBmb3IgKHZhciBoIGluIHRoaXMubWFwKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLm1hcFtoXS5sZW5ndGgpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgLy9icm9hZCBwaGFzZSBjb29yZGluYXRlXG4gICAgICAgICAgICAgICAgdmFyIGkgPSBoID4+IDE2LFxuICAgICAgICAgICAgICAgICAgICBqID0gKGggPDwgMTYpID4+IDE2O1xuICAgICAgICAgICAgICAgIGlmIChqIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBpID0gaSBeIC0xO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaSA+PSBoYXNoLm1heC54KSB7XG4gICAgICAgICAgICAgICAgICAgIGhhc2gubWF4LnggPSBpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGsgaW4gdGhpcy5tYXBbaF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVudCA9IHRoaXMubWFwW2hdW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9tYWtlIHN1cmUgdGhhdCB0aGlzIGlzIGEgQ3JhZnR5IGVudGl0eVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBlbnQgPT0gJ29iamVjdCcgJiYgJ3JlcXVpcmVzJyBpbiBlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb29yZHMubWF4LnggPSBNYXRoLm1heChjb29yZHMubWF4LngsIGVudC54ICsgZW50LncpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChpIDw9IGhhc2gubWluLngpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFzaC5taW4ueCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoayBpbiB0aGlzLm1hcFtoXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZW50ID0gdGhpcy5tYXBbaF1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGVudCA9PSAnb2JqZWN0JyAmJiAncmVxdWlyZXMnIGluIGVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3Jkcy5taW4ueCA9IE1hdGgubWluKGNvb3Jkcy5taW4ueCwgZW50LngpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChqID49IGhhc2gubWF4LnkpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFzaC5tYXgueSA9IGo7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoayBpbiB0aGlzLm1hcFtoXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZW50ID0gdGhpcy5tYXBbaF1ba107XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGVudCA9PSAnb2JqZWN0JyAmJiAncmVxdWlyZXMnIGluIGVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3Jkcy5tYXgueSA9IE1hdGgubWF4KGNvb3Jkcy5tYXgueSwgZW50LnkgKyBlbnQuaCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGogPD0gaGFzaC5taW4ueSkge1xuICAgICAgICAgICAgICAgICAgICBoYXNoLm1pbi55ID0gajtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrIGluIHRoaXMubWFwW2hdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbnQgPSB0aGlzLm1hcFtoXVtrXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZW50ID09ICdvYmplY3QnICYmICdyZXF1aXJlcycgaW4gZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29vcmRzLm1pbi55ID0gTWF0aC5taW4oY29vcmRzLm1pbi55LCBlbnQueSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjb29yZHM7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuSGFzaE1hcFxuICAgICAqIEBjYXRlZ29yeSAyRFxuICAgICAqIEJyb2FkLXBoYXNlIGNvbGxpc2lvbiBkZXRlY3Rpb24gZW5naW5lLiBTZWUgYmFja2dyb3VuZCBpbmZvcm1hdGlvbiBhdFxuICAgICAqXG4gICAgICogLSBbTiBUdXRvcmlhbCBCIC0gQnJvYWQtUGhhc2UgQ29sbGlzaW9uXShodHRwOi8vd3d3Lm1ldGFuZXRzb2Z0d2FyZS5jb20vdGVjaG5pcXVlL3R1dG9yaWFsQi5odG1sKVxuICAgICAqIC0gW0Jyb2FkLVBoYXNlIENvbGxpc2lvbiBEZXRlY3Rpb24gd2l0aCBDVURBXShodHRwLmRldmVsb3Blci5udmlkaWEuY29tL0dQVUdlbXMzL2dwdWdlbXMzX2NoMzIuaHRtbClcbiAgICAgKiBAc2VlIENyYWZ0eS5tYXBcbiAgICAgKi9cblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lkhhc2hNYXAua2V5XG4gICAgICogQGNvbXAgQ3JhZnR5Lkhhc2hNYXBcbiAgICAgKiBAc2lnbiBwdWJsaWMgT2JqZWN0IENyYWZ0eS5IYXNoTWFwLmtleShPYmplY3Qgb2JqKVxuICAgICAqIEBwYXJhbSBvYmogLSBhbiBPYmplY3QgdGhhdCBoYXMgLm1icigpIG9yIF94LCBfeSwgX3cgYW5kIF9oLlxuICAgICAqIEdldCB0aGUgcmVjdGFuZ3VsYXIgcmVnaW9uIChpbiB0ZXJtcyBvZiB0aGUgZ3JpZCwgd2l0aCBncmlkIHNpemUgYGNlbGxzaXplYCksIHdoZXJlIHRoZSBvYmplY3QgbWF5IGZhbGwgaW4uIFRoaXMgcmVnaW9uIGlzIGRldGVybWluZWQgYnkgdGhlIG9iamVjdCdzIGJvdW5kaW5nIGJveC5cbiAgICAgKiBUaGUgYGNlbGxzaXplYCBpcyA2NCBieSBkZWZhdWx0LlxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkuSGFzaE1hcC5jb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIEhhc2hNYXAua2V5ID0gZnVuY3Rpb24gKG9iaiwga2V5cykge1xuICAgICAgICBpZiAob2JqLl9tYnIpIHtcbiAgICAgICAgICAgIG9iaiA9IG9iai5fbWJyO1xuICAgICAgICB9XG4gICAgICAgIGlmICgha2V5cykge1xuICAgICAgICAgICAga2V5cyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAga2V5cy54MSA9IE1hdGguZmxvb3Iob2JqLl94IC8gY2VsbHNpemUpO1xuICAgICAgICBrZXlzLnkxID0gTWF0aC5mbG9vcihvYmouX3kgLyBjZWxsc2l6ZSk7XG4gICAgICAgIGtleXMueDIgPSBNYXRoLmZsb29yKChvYmouX3cgKyBvYmouX3gpIC8gY2VsbHNpemUpO1xuICAgICAgICBrZXlzLnkyID0gTWF0aC5mbG9vcigob2JqLl9oICsgb2JqLl95KSAvIGNlbGxzaXplKTtcbiAgICAgICAgcmV0dXJuIGtleXM7XG4gICAgfTtcblxuICAgIEhhc2hNYXAuaGFzaCA9IGZ1bmN0aW9uIChrZXlzKSB7XG4gICAgICAgIHJldHVybiBrZXlzLngxICsgU1BBQ0UgKyBrZXlzLnkxICsgU1BBQ0UgKyBrZXlzLngyICsgU1BBQ0UgKyBrZXlzLnkyO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBFbnRyeShrZXlzLCBvYmosIG1hcCkge1xuICAgICAgICB0aGlzLmtleXMgPSBrZXlzO1xuICAgICAgICB0aGlzLm1hcCA9IG1hcDtcbiAgICAgICAgdGhpcy5vYmogPSBvYmo7XG4gICAgfVxuXG4gICAgRW50cnkucHJvdG90eXBlID0ge1xuICAgICAgICB1cGRhdGU6IGZ1bmN0aW9uIChyZWN0KSB7XG4gICAgICAgICAgICAvL2NoZWNrIGlmIGJ1Y2tldHMgY2hhbmdlXG4gICAgICAgICAgICBpZiAoSGFzaE1hcC5oYXNoKEhhc2hNYXAua2V5KHJlY3QsIGtleUhvbGRlcikpICE9IEhhc2hNYXAuaGFzaCh0aGlzLmtleXMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXAucmVmcmVzaCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IEhhc2hNYXA7XG4iLCJ2YXIgQ3JhZnR5ID0gcmVxdWlyZSgnLi9jb3JlLmpzJyksXG5cdGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG5DcmFmdHkuZWFzaW5nID0gZnVuY3Rpb24oZHVyYXRpb24pIHtcblx0dGhpcy50aW1lUGVyRnJhbWUgPSAxMDAwIC8gQ3JhZnR5LnRpbWVyLkZQUygpO1xuXHR0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247ICAgLy9kZWZhdWx0IGR1cmF0aW9uIGdpdmVuIGluIG1zXG5cdHRoaXMucmVzZXQoKTtcbn07XG5cblxuQ3JhZnR5LmVhc2luZy5wcm90b3R5cGUgPSB7XG5cdGR1cmF0aW9uOiAwLFxuXHRjbG9jazowLFxuXHRzdGVwczogbnVsbCxcblx0Y29tcGxldGU6IGZhbHNlLFxuXHRwYXVzZWQ6IGZhbHNlLFxuXG5cdC8vIGluaXQgdmFsdWVzXG5cdHJlc2V0OiBmdW5jdGlvbigpe1xuXHRcdHRoaXMubG9vcHMgPSAxO1xuXHRcdHRoaXMuY2xvY2sgPSAwO1xuXHRcdHRoaXMuY29tcGxldGUgPSBmYWxzZTtcblx0XHR0aGlzLnBhdXNlZCA9IGZhbHNlO1xuXHR9LFxuXG5cdHJlcGVhdDogZnVuY3Rpb24obG9vcENvdW50KXtcblx0XHR0aGlzLmxvb3BzID0gbG9vcENvdW50O1xuXHR9LFxuXG5cdHNldFByb2dyZXNzOiBmdW5jdGlvbihwcm9ncmVzcywgbG9vcENvdW50KXtcblx0XHR0aGlzLmNsb2NrID0gdGhpcy5kdXJhdGlvbiAqIHByb2dyZXNzO1xuXHRcdGlmICh0eXBlb2YgbG9vcENvdW50ICE9PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0dGhpcy5sb29wcyA9IGxvb3BDb3VudDtcblxuXHR9LFxuXG5cdHBhdXNlOiBmdW5jdGlvbigpe1xuXHRcdHRoaXMucGF1c2VkID0gdHJ1ZTtcblx0fSxcblxuXHRyZXN1bWU6IGZ1bmN0aW9uKCl7XG5cdFx0dGhpcy5wYXVzZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNvbXBsZXRlID0gZmFsc2U7XG5cdH0sXG5cblx0Ly8gSW5jcmVtZW50IHRoZSBjbG9jayBieSBzb21lIGFtb3VudCBkdFxuXHQvLyBIYW5kbGVzIGxvb3BpbmcgYW5kIHNldHMgYSBmbGFnIG9uIGNvbXBsZXRpb25cblx0dGljazogZnVuY3Rpb24oZHQpe1xuXHRcdGlmICh0aGlzLnBhdXNlZCB8fCB0aGlzLmNvbXBsZXRlKSByZXR1cm47XG5cdFx0dGhpcy5jbG9jayArPSBkdDtcblx0XHR0aGlzLmZyYW1lcyA9IE1hdGguZmxvb3IodGhpcy5jbG9jay90aGlzLnRpbWVQZXJGcmFtZSk7XG5cdFx0d2hpbGUgKHRoaXMuY2xvY2sgPj0gdGhpcy5kdXJhdGlvbiAmJiB0aGlzLmNvbXBsZXRlID09PSBmYWxzZSl7XG5cdFx0XHR0aGlzLmxvb3BzLS07XG5cdFx0XHRpZiAodGhpcy5sb29wcyA+IDApXG5cdFx0XHRcdHRoaXMuY2xvY2sgLT0gdGhpcy5kdXJhdGlvbjtcblx0XHRcdGVsc2Vcblx0XHRcdFx0dGhpcy5jb21wbGV0ZSA9IHRydWU7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIHNhbWUgYXMgdmFsdWUgZm9yIG5vdzsgd2l0aCBvdGhlciB0aW1lIHZhbHVlIGZ1bmN0aW9ucyB3b3VsZCBiZSBtb3JlIHVzZWZ1bFxuXHR0aW1lOiBmdW5jdGlvbigpe1xuXHRcdHJldHVybiAoIE1hdGgubWluKHRoaXMuY2xvY2svdGhpcy5kdXJhdGlvbiwgMSkgKTtcblxuXHR9LFxuXG5cdC8vIFZhbHVlIGlzIHdoZXJlIGFsb25nIHRoZSB0d2VlbmluZyBjdXJ2ZSB3ZSBhcmVcblx0Ly8gRm9yIG5vdyBpdCdzIHNpbXBseSBsaW5lYXI7IGJ1dCB3ZSBjYW4gZWFzaWx5IGFkZCBuZXcgdHlwZXNcblx0dmFsdWU6IGZ1bmN0aW9uKCl7XG5cdFx0cmV0dXJuIHRoaXMudGltZSgpO1xuXHR9XG5cbn07XG5cblxuXG5cblxuXG4vKipAXG4qICNTcHJpdGVBbmltYXRpb25cbiogQGNhdGVnb3J5IEFuaW1hdGlvblxuKiBAdHJpZ2dlciBTdGFydEFuaW1hdGlvbiAtIFdoZW4gYW4gYW5pbWF0aW9uIHN0YXJ0cyBwbGF5aW5nLCBvciBpcyByZXN1bWVkIGZyb20gdGhlIHBhdXNlZCBzdGF0ZSAtIHtSZWVsfVxuKiBAdHJpZ2dlciBBbmltYXRpb25FbmQgLSBXaGVuIHRoZSBhbmltYXRpb24gZmluaXNoZXMgLSB7IFJlZWwgfVxuKiBAdHJpZ2dlciBGcmFtZUNoYW5nZSAtIEVhY2ggdGltZSB0aGUgZnJhbWUgb2YgdGhlIGN1cnJlbnQgcmVlbCBjaGFuZ2VzIC0geyBSZWVsIH1cbiogQHRyaWdnZXIgUmVlbENoYW5nZSAtIFdoZW4gdGhlIHJlZWwgY2hhbmdlcyAtIHsgUmVlbCB9XG4qXG4qIFVzZWQgdG8gYW5pbWF0ZSBzcHJpdGVzIGJ5IHRyZWF0aW5nIGEgc3ByaXRlIG1hcCBhcyBhIHNldCBvZiBhbmltYXRpb24gZnJhbWVzLlxuKiBNdXN0IGJlIGFwcGxpZWQgdG8gYW4gZW50aXR5IHRoYXQgaGFzIGEgc3ByaXRlLW1hcCBjb21wb25lbnQuXG4qXG4qIFRvIGRlZmluZSBhbiBhbmltYXRpb24sIHNlZSB0aGUgYHJlZWxgIG1ldGhvZC4gIFRvIHBsYXkgYW4gYW5pbWF0aW9uLCBzZWUgdGhlIGBhbmltYXRlYCBtZXRob2QuXG4qXG4qIEEgcmVlbCBpcyBhbiBvYmplY3QgdGhhdCBjb250YWlucyB0aGUgYW5pbWF0aW9uIGZyYW1lcyBhbmQgY3VycmVudCBzdGF0ZSBmb3IgYW4gYW5pbWF0aW9uLiAgVGhlIHJlZWwgb2JqZWN0IGhhcyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4qIEBwYXJhbSBpZDogKFN0cmluZykgLSB0aGUgbmFtZSBvZiB0aGUgcmVlbFxuKiBAcGFyYW0gZnJhbWVzOiAoQXJyYXkpIC0gQSBsaXN0IG9mIGZyYW1lcyBpbiB0aGUgZm9ybWF0IFt4cG9zLCB5cG9zXVxuKiBAcGFyYW0gY3VycmVudEZyYW1lOiAoTnVtYmVyKSAtIFRoZSBpbmRleCBvZiB0aGUgY3VycmVudCBmcmFtZVxuKiBAcGFyYW0gZWFzaW5nOiAoQ3JhZnR5LmVhc2luZyBvYmplY3QpIC0gVGhlIG9iamVjdCB0aGF0IGhhbmRsZXMgdGhlIGludGVybmFsIHByb2dyZXNzIG9mIHRoZSBhbmltYXRpb24uXG4qIEBwYXJhbSBkdXJhdGlvbjogKE51bWJlcikgLSBUaGUgZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzLlxuKlxuKiBNYW55IGFuaW1hdGlvbiByZWxhdGVkIGV2ZW50cyBwYXNzIGEgcmVlbCBvYmplY3QgYXMgZGF0YS4gIEFzIHR5cGljYWwgd2l0aCBldmVudHMsIHRoaXMgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgcmVhZCBvbmx5IGRhdGEgdGhhdCBtaWdodCBiZSBsYXRlciBhbHRlcmVkIGJ5IHRoZSBlbnRpdHkuICBJZiB5b3Ugd2lzaCB0byBwcmVzZXJ2ZSB0aGUgZGF0YSwgbWFrZSBhIGNvcHkgb2YgaXQuXG4qXG4qIEBzZWUgY3JhZnR5LnNwcml0ZVxuKi9cbkNyYWZ0eS5jKFwiU3ByaXRlQW5pbWF0aW9uXCIsIHtcblx0Lypcblx0KlxuXHQqIEEgbWFwIGluIHdoaWNoIHRoZSBrZXlzIGFyZSB0aGUgbmFtZXMgYXNzaWduZWQgdG8gYW5pbWF0aW9ucyBkZWZpbmVkIHVzaW5nXG5cdCogdGhlIGNvbXBvbmVudCAoYWxzbyBrbm93biBhcyByZWVsSURzKSwgYW5kIHRoZSB2YWx1ZXMgYXJlIG9iamVjdHMgZGVzY3JpYmluZ1xuXHQqIHRoZSBhbmltYXRpb24gYW5kIGl0cyBzdGF0ZS5cblx0Ki9cblx0X3JlZWxzOiBudWxsLFxuXG5cdC8qXG5cdCogVGhlIHJlZWxJRCBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSByZWVsICh3aGljaCBpcyBvbmUgb2YgdGhlIGVsZW1lbnRzIGluIGB0aGlzLl9yZWVsc2ApLlxuXHQqIFRoaXMgdmFsdWUgaXMgYG51bGxgIGlmIG5vIHJlZWwgaXMgYWN0aXZlLiBTb21lIG9mIHRoZSBjb21wb25lbnQncyBhY3Rpb25zIGNhbiBiZSBpbnZva2VkXG5cdCogd2l0aG91dCBzcGVjaWZ5aW5nIGEgcmVlbCwgaW4gd2hpY2ggY2FzZSB0aGV5IHdpbGwgd29yayBvbiB0aGUgYWN0aXZlIHJlZWwuXG5cdCovXG5cdF9jdXJyZW50UmVlbElkOiBudWxsLFxuXG5cdC8qXG5cdCogVGhlIGN1cnJlbnRseSBhY3RpdmUgcmVlbC5cblx0KiBUaGlzIHZhbHVlIGlzIGBudWxsYCBpZiBubyByZWVsIGlzIGFjdGl2ZS5cblx0Ki9cblx0X2N1cnJlbnRSZWVsOiBudWxsLFxuXG5cdC8qXG5cdCogV2hldGhlciBvciBub3QgYW4gYW5pbWF0aW9uIGlzIGN1cnJlbnRseSBwbGF5aW5nLlxuXHQqL1xuXHRfaXNQbGF5aW5nOiBmYWxzZSxcblxuXHQvKipAXG5cdCogIy5hbmltYXRpb25TcGVlZFxuXHQqIEBjb21wIFNwcml0ZUFuaW1hdGlvblxuXHQqXG5cdCogVGhlIHBsYXliYWNrIHJhdGUgb2YgdGhlIGFuaW1hdGlvbi4gIFRoaXMgcHJvcGVydHkgZGVmYXVsdHMgdG8gMS5cblx0Ki9cblx0YW5pbWF0aW9uU3BlZWQ6IDEsXG5cblxuXHRpbml0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fcmVlbHMgPSB7fTtcblx0fSxcblxuXHQvKipAXG5cdCogIy5yZWVsXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCogVXNlZCB0byBkZWZpbmUgcmVlbHMsIHRvIGNoYW5nZSB0aGUgYWN0aXZlIHJlZWwsIGFuZCB0byBmZXRjaCB0aGUgaWQgb2YgdGhlIGFjdGl2ZSByZWVsLlxuXHQqXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLnJlZWwoU3RyaW5nIHJlZWxJZCwgRHVyYXRpb24gZHVyYXRpb24sIE51bWJlciBmcm9tWCwgTnVtYmVyIGZyb21ZLCBOdW1iZXIgZnJhbWVDb3VudClcblx0KiBEZWZpbmVzIGEgcmVlbCBieSBzdGFydGluZyBhbmQgZW5kaW5nIHBvc2l0aW9uIG9uIHRoZSBzcHJpdGUgc2hlZXQuXG5cdCogQHBhcmFtIHJlZWxJZCAtIElEIG9mIHRoZSBhbmltYXRpb24gcmVlbCBiZWluZyBjcmVhdGVkXG5cdCogQHBhcmFtIGR1cmF0aW9uIC0gVGhlIGxlbmd0aCBvZiB0aGUgYW5pbWF0aW9uIGluIG1pbGxpc2Vjb25kcy5cblx0KiBAcGFyYW0gZnJvbVggLSBTdGFydGluZyBgeGAgcG9zaXRpb24gb24gdGhlIHNwcml0ZSBtYXAgKHgncyB1bml0IGlzIHRoZSBob3Jpem9udGFsIHNpemUgb2YgdGhlIHNwcml0ZSBpbiB0aGUgc3ByaXRlIG1hcCkuXG5cdCogQHBhcmFtIGZyb21ZIC0gYHlgIHBvc2l0aW9uIG9uIHRoZSBzcHJpdGUgbWFwICh5J3MgdW5pdCBpcyB0aGUgaG9yaXpvbnRhbCBzaXplIG9mIHRoZSBzcHJpdGUgaW4gdGhlIHNwcml0ZSBtYXApLiBSZW1haW5zIGNvbnN0YW50IHRocm91Z2ggdGhlIGFuaW1hdGlvbi5cblx0KiBAcGFyYW0gZnJhbWVDb3VudCAtIFRoZSBudW1iZXIgb2Ygc2VxdWVudGlhbCBmcmFtZXMgaW4gdGhlIGFuaW1hdGlvbi4gIElmIG5lZ2F0aXZlLCB0aGUgYW5pbWF0aW9uIHdpbGwgcGxheSBiYWNrd2FyZHMuXG5cdCpcblx0KiBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbChTdHJpbmcgcmVlbElkLCBEdXJhdGlvbiBkdXJhdGlvbiwgQXJyYXkgZnJhbWVzKVxuXHQqIERlZmluZXMgYSByZWVsIGJ5IGFuIGV4cGxpY2l0IGxpc3Qgb2YgZnJhbWVzXG5cdCogQHBhcmFtIHJlZWxJZCAtIElEIG9mIHRoZSBhbmltYXRpb24gcmVlbCBiZWluZyBjcmVhdGVkXG5cdCogQHBhcmFtIGR1cmF0aW9uIC0gVGhlIGxlbmd0aCBvZiB0aGUgYW5pbWF0aW9uIGluIG1pbGxpc2Vjb25kcy5cblx0KiBAcGFyYW0gZnJhbWVzIC0gQW4gYXJyYXkgb2YgYXJyYXlzIGNvbnRhaW5pbmcgdGhlIGB4YCBhbmQgYHlgIHZhbHVlcyBvZiBzdWNjZXNzaXZlIGZyYW1lczogW1t4MSx5MV0sW3gyLHkyXSwuLi5dICh0aGUgdmFsdWVzIGFyZSBpbiB0aGUgdW5pdCBvZiB0aGUgc3ByaXRlIG1hcCdzIHdpZHRoL2hlaWdodCByZXNwZWN0aXZlbHkpLlxuXHQqXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLnJlZWwoU3RyaW5nIHJlZWxJZClcblx0KiBTd2l0Y2hlcyB0byB0aGUgc3BlY2lmaWVkIHJlZWwuICBUaGUgc3ByaXRlIHdpbGwgYmUgdXBkYXRlZCB0byB0aGF0IHJlZWwncyBjdXJyZW50IGZyYW1lXG5cdCogQHBhcmFtIHJlZWxJRCAtIHRoZSBJRCB0byBzd2l0Y2ggdG9cblx0KlxuXHQqIEBzaWduIHB1YmxpYyBSZWVsIC5yZWVsKClcblx0KiBAcmV0dXJuIFRoZSBpZCBvZiB0aGUgY3VycmVudCByZWVsXG5cdCpcblx0KlxuXHQqIEEgbWV0aG9kIHRvIGhhbmRsZSBhbmltYXRpb24gcmVlbHMuICBPbmx5IHdvcmtzIGZvciBzcHJpdGVzIGJ1aWx0IHdpdGggdGhlIENyYWZ0eS5zcHJpdGUgbWV0aG9kcy5cblx0KiBTZWUgdGhlIFR3ZWVuIGNvbXBvbmVudCBmb3IgYW5pbWF0aW9uIG9mIDJEIHByb3BlcnRpZXMuXG5cdCpcblx0KiBUbyBzZXR1cCBhbiBhbmltYXRpb24gcmVlbCwgcGFzcyB0aGUgbmFtZSBvZiB0aGUgcmVlbCAodXNlZCB0byBpZGVudGlmeSB0aGUgcmVlbCBsYXRlciksIGFuZCBlaXRoZXIgYW5cblx0KiBhcnJheSBvZiBhYnNvbHV0ZSBzcHJpdGUgcG9zaXRpb25zIG9yIHRoZSBzdGFydCB4IG9uIHRoZSBzcHJpdGUgbWFwLCB0aGUgeSBvbiB0aGUgc3ByaXRlIG1hcCBhbmQgdGhlbiB0aGUgZW5kIHggb24gdGhlIHNwcml0ZSBtYXAuXG5cdCpcblx0KlxuXHQqIEBleGFtcGxlXG5cdCogfn5+XG5cdCogLy8gRGVmaW5lIGEgc3ByaXRlLW1hcCBjb21wb25lbnRcblx0KiBDcmFmdHkuc3ByaXRlKDE2LCBcImltYWdlcy9zcHJpdGUucG5nXCIsIHtcblx0KiAgICAgUGxheWVyU3ByaXRlOiBbMCwwXVxuXHQqIH0pO1xuXHQqXG5cdCogLy8gRGVmaW5lIGFuIGFuaW1hdGlvbiBvbiB0aGUgc2Vjb25kIHJvdyBvZiB0aGUgc3ByaXRlIG1hcCAoZnJvbVkgPSAxKVxuXHQqIC8vIGZyb20gdGhlIGxlZnQgbW9zdCBzcHJpdGUgKGZyb21YID0gMCkgdG8gdGhlIGZvdXJ0aCBzcHJpdGVcblx0KiAvLyBvbiB0aGF0IHJvdyAoZnJhbWVDb3VudCA9IDQpLCB3aXRoIGEgZHVyYXRpb24gb2YgMSBzZWNvbmRcblx0KiBDcmFmdHkuZShcIjJELCBET00sIFNwcml0ZUFuaW1hdGlvbiwgUGxheWVyU3ByaXRlXCIpLnJlZWwoJ1BsYXllclJ1bm5pbmcnLCAxMDAwLCAwLCAxLCA0KTtcblx0KlxuXHQqIC8vIFRoaXMgaXMgdGhlIHNhbWUgYW5pbWF0aW9uIGRlZmluaXRpb24sIGJ1dCB1c2luZyB0aGUgYWx0ZXJuYXRpdmUgbWV0aG9kXG5cdCogQ3JhZnR5LmUoXCIyRCwgRE9NLCBTcHJpdGVBbmltYXRpb24sIFBsYXllclNwcml0ZVwiKS5yZWVsKCdQbGF5ZXJSdW5uaW5nJywgMTAwMCwgW1swLCAxXSwgWzEsIDFdLCBbMiwgMV0sIFszLCAxXV0pO1xuXHQqIH5+flxuXHQqL1xuXHRyZWVsOiBmdW5jdGlvbiAocmVlbElkLCBkdXJhdGlvbiwgZnJvbVgsIGZyb21ZLCBmcmFtZUNvdW50KSB7XG5cdFx0Ly8gQHNpZ24gcHVibGljIHRoaXMgLnJlZWwoKVxuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuXHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRSZWVsSWQ7XG5cblx0XHQvLyBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbChTdHJpbmcgcmVlbElEKVxuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxICYmIHR5cGVvZiByZWVsSWQgPT09IFwic3RyaW5nXCIpe1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLl9yZWVsc1tyZWVsSWRdID09PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0XHR0aHJvdyhcIlRoZSBzcGVjaWZpZWQgcmVlbCBcIiArIHJlZWxJZCArIFwiIGlzIHVuZGVmaW5lZC5cIik7XG5cdFx0XHR0aGlzLnBhdXNlQW5pbWF0aW9uKCk7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFJlZWxJZCAhPT0gcmVlbElkKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRSZWVsSWQgPSByZWVsSWQ7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRSZWVsID0gdGhpcy5fcmVlbHNbcmVlbElkXTtcblx0XHRcdFx0Ly8gQ2hhbmdlIHRoZSB2aXNpYmxlIHNwcml0ZVxuXHRcdFx0XHR0aGlzLl91cGRhdGVTcHJpdGUoKTtcblx0XHRcdFx0Ly8gVHJpZ2dlciBldmVudFxuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJSZWVsQ2hhbmdlXCIsIHRoaXMuX2N1cnJlbnRSZWVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXG5cdFx0dmFyIHJlZWwsIGk7XG5cblx0XHRyZWVsID0ge1xuXHRcdFx0aWQ6IHJlZWxJZCxcblx0XHRcdGZyYW1lczogW10sXG5cdFx0XHRjdXJyZW50RnJhbWU6IDAsXG5cdFx0XHRlYXNpbmc6IG5ldyBDcmFmdHkuZWFzaW5nKGR1cmF0aW9uKSxcblx0XHRcdGRlZmF1bHRMb29wczogMVxuXHRcdH07XG5cblx0XHRyZWVsLmR1cmF0aW9uID0gcmVlbC5lYXNpbmcuZHVyYXRpb247XG5cblx0XHQvLyBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbChTdHJpbmcgcmVlbElkLCBOdW1iZXIgZHVyYXRpb24sIE51bWJlciBmcm9tWCwgTnVtYmVyIGZyb21ZLCBOdW1iZXIgZnJhbWVEdXJhdGlvbilcblx0XHRpZiAodHlwZW9mIGZyb21YID09PSBcIm51bWJlclwiKSB7XG5cdFx0XHRpID0gZnJvbVg7XG5cdFx0XHR5ID0gZnJvbVk7XG5cdFx0XHRpZiAoZnJhbWVDb3VudCA+PSAwKSB7XG5cdFx0XHRcdGZvciAoOyBpIDwgZnJvbVggKyBmcmFtZUNvdW50IDsgaSsrKSB7XG5cdFx0XHRcdFx0cmVlbC5mcmFtZXMucHVzaChbaSwgeV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Zm9yICg7IGkgPiBmcm9tWCArIGZyYW1lQ291bnQ7IGktLSkge1xuXHRcdFx0XHRcdHJlZWwuZnJhbWVzLnB1c2goW2ksIHldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbChTdHJpbmcgcmVlbElkLCBOdW1iZXIgZHVyYXRpb24sIEFycmF5IGZyYW1lcylcblx0XHRlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzICYmIHR5cGVvZiBmcm9tWCA9PT0gXCJvYmplY3RcIikge1xuXHRcdFx0cmVlbC5mcmFtZXMgPSBmcm9tWDtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aHJvdyBcIlVyZWNvZ25pemVkIGFyZ3VtZW50cy4gUGxlYXNlIHNlZSB0aGUgZG9jdW1lbnRhdGlvbiBmb3IgJ3JlZWwoLi4uKScuXCI7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVlbHNbcmVlbElkXSA9IHJlZWw7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvKipAXG5cdCogIy5hbmltYXRlXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLmFuaW1hdGUoW1N0cmluZyByZWVsSWRdIFssIE51bWJlciBsb29wQ291bnRdKVxuXHQqIEBwYXJhbSByZWVsSWQgLSBJRCBvZiB0aGUgYW5pbWF0aW9uIHJlZWwgdG8gcGxheS4gIERlZmF1bHRzIHRvIHRoZSBjdXJyZW50IHJlZWwgaWYgbm9uZSBpcyBzcGVjaWZpZWQuXG5cdCogQHBhcmFtIGxvb3BDb3VudCAtIE51bWJlciBvZiB0aW1lcyB0byByZXBlYXQgdGhlIGFuaW1hdGlvbi4gVXNlIC0xIHRvIHJlcGVhdCBpbmRlZmluaXRlbHkuICBEZWZhdWx0cyB0byAxLlxuXHQqXG5cdCogUGxheSBvbmUgb2YgdGhlIHJlZWxzIHByZXZpb3VzbHkgZGVmaW5lZCB0aHJvdWdoIGAucmVlbCguLi4pYC4gU2ltcGx5IHBhc3MgdGhlIG5hbWUgb2YgdGhlIHJlZWwuIElmIHlvdSB3aXNoIHRoZVxuXHQqIGFuaW1hdGlvbiB0byBwbGF5IG11bHRpcGxlIHRpbWVzIGluIHN1Y2Nlc3Npb24sIHBhc3MgaW4gdGhlIGFtb3VudCBvZiB0aW1lcyBhcyBhbiBhZGRpdGlvbmFsIHBhcmFtZXRlci5cblx0KiBUbyBoYXZlIHRoZSBhbmltYXRpb24gcmVwZWF0IGluZGVmaW5pdGVseSwgcGFzcyBpbiBgLTFgLlxuXHQqXG5cdCogSWYgYW5vdGhlciBhbmltYXRpb24gaXMgY3VycmVudGx5IHBsYXlpbmcsIGl0IHdpbGwgYmUgcGF1c2VkLlxuXHQqXG5cdCogVGhpcyB3aWxsIGFsd2F5cyBwbGF5IGFuIGFuaW1hdGlvbiBmcm9tIHRoZSBiZWdpbm5pbmcuICBJZiB5b3Ugd2lzaCB0byByZXN1bWUgZnJvbSB0aGUgY3VycmVudCBzdGF0ZSBvZiBhIHJlZWwsIHVzZSBgcmVzdW1lQW5pbWF0aW9uKClgLlxuXHQqXG5cdCogT25jZSBhbiBhbmltYXRpb24gZW5kcywgaXQgd2lsbCByZW1haW4gYXQgaXRzIGxhc3QgZnJhbWUuXG5cdCpcblx0KlxuXHQqIEBleGFtcGxlXG5cdCogfn5+XG5cdCogLy8gRGVmaW5lIGEgc3ByaXRlLW1hcCBjb21wb25lbnRcblx0KiBDcmFmdHkuc3ByaXRlKDE2LCBcImltYWdlcy9zcHJpdGUucG5nXCIsIHtcblx0KiAgICAgUGxheWVyU3ByaXRlOiBbMCwwXVxuXHQqIH0pO1xuXHQqXG5cdCogLy8gUGxheSB0aGUgYW5pbWF0aW9uIGFjcm9zcyAyMCBmcmFtZXMgKHNvIGVhY2ggc3ByaXRlIGluIHRoZSA0IHNwcml0ZSBhbmltYXRpb24gc2hvdWxkIGJlIHNlZW4gZm9yIDUgZnJhbWVzKSBhbmQgcmVwZWF0IGluZGVmaW5pdGVseVxuXHQqIENyYWZ0eS5lKFwiMkQsIERPTSwgU3ByaXRlQW5pbWF0aW9uLCBQbGF5ZXJTcHJpdGVcIilcblx0KiAgICAgLnJlZWwoJ1BsYXllclJ1bm5pbmcnLCAyMCwgMCwgMCwgMykgLy8gc2V0dXAgYW5pbWF0aW9uXG5cdCogICAgIC5hbmltYXRlKCdQbGF5ZXJSdW5uaW5nJywgLTEpOyAvLyBzdGFydCBhbmltYXRpb25cblx0KiB+fn5cblx0Ki9cblx0YW5pbWF0ZTogZnVuY3Rpb24ocmVlbElkLCBsb29wQ291bnQpIHtcblxuXHRcdHZhciBwb3M7XG5cblxuXHRcdC8vIHN3aXRjaCB0byB0aGUgc3BlY2lmaWVkIHJlZWwgaWYgbmVjZXNzYXJ5XG5cdFx0aWYgKHR5cGVvZiByZWVsSWQgPT09IFwic3RyaW5nXCIpXG5cdFx0XHR0aGlzLnJlZWwocmVlbElkKTtcblxuXHRcdHZhciBjdXJyZW50UmVlbCA9IHRoaXMuX2N1cnJlbnRSZWVsO1xuXG5cdFx0aWYgKHR5cGVvZiBjdXJyZW50UmVlbCA9PT0gXCJ1bmRlZmluZWRcIiB8fCBjdXJyZW50UmVlbCA9PT0gbnVsbClcblx0XHRcdHRocm93KFwiTm8gcmVlbCBpcyBzcGVjaWZpZWQsIGFuZCB0aGVyZSBpcyBubyBjdXJyZW50bHkgYWN0aXZlIHJlZWwuXCIpO1xuXG5cdFx0dGhpcy5wYXVzZUFuaW1hdGlvbigpOyAvLyBUaGlzIHdpbGwgcGF1c2UgdGhlIGN1cnJlbnQgYW5pbWF0aW9uLCBpZiBvbmUgaXMgcGxheWluZ1xuXG5cdFx0Ly8gSGFuZGxlIHJlcGVhdHM7IGlmIGxvb3BDb3VudCBpcyB1bmRlZmluZWQgYW5kIHJlZWxJRCBpcyBhIG51bWJlciwgY2FsbGluZyB3aXRoIHRoYXQgc2lnbmF0dXJlXG5cdFx0aWYgKHR5cGVvZiBsb29wQ291bnQgPT09IFwidW5kZWZpbmVkXCIpXG5cdFx0XHRpZiAodHlwZW9mIHJlZWxJZCA9PT0gXCJudW1iZXJcIilcblx0XHRcdFx0bG9vcENvdW50ID0gcmVlbElkO1xuXHRcdFx0ZWxzZVxuXHRcdFx0XHRsb29wQ291bnQgPSAxO1xuXG5cdFx0Ly8gc2V0IHRoZSBhbmltYXRpb24gdG8gdGhlIGJlZ2lubmluZ1xuXHRcdGN1cnJlbnRSZWVsLmVhc2luZy5yZXNldCgpO1xuXG5cblx0XHQvLyB1c2VyIHByb3ZpZGVkIGxvb3AgY291bnQuXG5cdFx0dGhpcy5sb29wcyhsb29wQ291bnQpO1xuXG5cdFx0Ly8gdHJpZ2dlciB0aGUgbmVjZXNzYXJ5IGV2ZW50cyBhbmQgc3dpdGNoIHRvIHRoZSBmaXJzdCBmcmFtZVxuXHRcdHRoaXMuX3NldEZyYW1lKDApO1xuXG5cdFx0Ly8gU3RhcnQgdGhlIGFuaW1cblx0XHR0aGlzLmJpbmQoXCJFbnRlckZyYW1lXCIsIHRoaXMuX2FuaW1hdGlvblRpY2spO1xuXHRcdHRoaXMuX2lzUGxheWluZyA9IHRydWU7XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJTdGFydEFuaW1hdGlvblwiLCBjdXJyZW50UmVlbCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0LyoqQFxuXHQqICMucmVzdW1lQW5pbWF0aW9uXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLnJlc3VtZUFuaW1hdGlvbigpXG5cdCpcblx0KiBUaGlzIHdpbGwgcmVzdW1lIGFuaW1hdGlvbiBvZiB0aGUgY3VycmVudCByZWVsIGZyb20gaXRzIGN1cnJlbnQgc3RhdGUuXG5cdCogSWYgYSByZWVsIGlzIGFscmVhZHkgcGxheWluZywgb3IgdGhlcmUgaXMgbm8gY3VycmVudCByZWVsLCB0aGVyZSB3aWxsIGJlIG5vIGVmZmVjdC5cblx0Ki9cblx0cmVzdW1lQW5pbWF0aW9uOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5faXNQbGF5aW5nID09PSBmYWxzZSAmJiAgdGhpcy5fY3VycmVudFJlZWwgIT09IG51bGwpIHtcblx0XHRcdHRoaXMuYmluZChcIkVudGVyRnJhbWVcIiwgdGhpcy5fYW5pbWF0aW9uVGljayk7XG5cdFx0XHR0aGlzLl9pc1BsYXlpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5fY3VycmVudFJlZWwuZWFzaW5nLnJlc3VtZSgpO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiU3RhcnRBbmltYXRpb25cIiwgdGhpcy5fY3VycmVudFJlZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvKipAXG5cdCogIy5wYXVzZUFuaW1hdGlvblxuXHQqIEBjb21wIFNwcml0ZUFuaW1hdGlvblxuXHQqIEBzaWduIHB1YmxpYyB0aGlzIC5wYXVzZUFuaW1hdGlvbih2b2lkKVxuXHQqXG5cdCogUGF1c2VzIHRoZSBjdXJyZW50bHkgcGxheWluZyBhbmltYXRpb24sIG9yIGRvZXMgbm90aGluZyBpZiBubyBhbmltYXRpb24gaXMgcGxheWluZy5cblx0Ki9cblx0cGF1c2VBbmltYXRpb246IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5faXNQbGF5aW5nID09PSB0cnVlKSB7XG5cdFx0XHR0aGlzLnVuYmluZChcIkVudGVyRnJhbWVcIiwgdGhpcy5fYW5pbWF0aW9uVGljayk7XG5cdFx0XHR0aGlzLl9pc1BsYXlpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3JlZWxzW3RoaXMuX2N1cnJlbnRSZWVsSWRdLmVhc2luZy5wYXVzZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvKipAXG5cdCogIy5yZXNldEFuaW1hdGlvblxuXHQqIEBjb21wIFNwcml0ZUFuaW1hdGlvblxuXHQqIEBzaWduIHB1YmxpYyB0aGlzIC5yZXNldEFuaW1hdGlvbigpXG5cdCpcblx0KiBSZXNldHMgdGhlIGN1cnJlbnQgYW5pbWF0aW9uIHRvIGl0cyBpbml0aWFsIHN0YXRlLiAgUmVzZXRzIHRoZSBudW1iZXIgb2YgbG9vcHMgdG8gdGhlIGxhc3Qgc3BlY2lmaWVkIHZhbHVlLCB3aGljaCBkZWZhdWx0cyB0byAxLlxuXHQqXG5cdCogTmVpdGhlciBwYXVzZXMgbm9yIHJlc3VtZXMgdGhlIGN1cnJlbnQgYW5pbWF0aW9uLlxuXHQqL1xuXHRyZXNldEFuaW1hdGlvbjogZnVuY3Rpb24oKXtcblx0XHR2YXIgY3VycmVudFJlZWwgPSB0aGlzLl9jdXJyZW50UmVlbDtcblx0XHRpZiAgKGN1cnJlbnRSZWVsID09PSBudWxsKVxuXHRcdFx0dGhyb3coXCJObyBhY3RpdmUgcmVlbCB0byByZXNldC5cIik7XG5cdFx0dGhpcy5yZWVsUG9zaXRpb24oMCk7XG5cdFx0Y3VycmVudFJlZWwuZWFzaW5nLnJlcGVhdChjdXJyZW50UmVlbC5kZWZhdWx0TG9vcHMpO1xuXHRcdHJldHVybiB0aGlzO1xuICAgfSxcblxuXG5cdC8qKkBcblx0KiAjLmxvb3BzXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLmxvb3BzKE51bWJlciBsb29wQ291bnQpXG5cdCogQHBhcmFtIGxvb3BDb3VudCAtIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gcGxheSB0aGUgYW5pbWF0aW9uXG5cdCpcblx0KiBTZXRzIHRoZSBudW1iZXIgb2YgdGltZXMgdGhlIGFuaW1hdGlvbiB3aWxsIGxvb3AgZm9yLlxuXHQqIElmIGNhbGxlZCB3aGlsZSBhbiBhbmltYXRpb24gaXMgaW4gcHJvZ3Jlc3MsIHRoZSBjdXJyZW50IHN0YXRlIHdpbGwgYmUgY29uc2lkZXJlZCB0aGUgZmlyc3QgbG9vcC5cblx0KlxuXHQqIEBzaWduIHB1YmxpYyBOdW1iZXIgLmxvb3BzKClcblx0KiBAcmV0dXJucyBUaGUgbnVtYmVyIG9mIGxvb3BzIGxlZnQuICBSZXR1cm5zIDAgaWYgbm8gcmVlbCBpcyBhY3RpdmUuXG5cdCovXG5cdGxvb3BzOiBmdW5jdGlvbihsb29wQ291bnQpIHtcblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCl7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFJlZWwgIT09IG51bGwpXG5cdFx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50UmVlbC5lYXNpbmcubG9vcHM7XG5cdFx0XHRlbHNlXG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVlbCAhPT0gbnVsbCl7XG5cdFx0XHRpZiAobG9vcENvdW50IDwgMClcblx0XHRcdFx0bG9vcENvdW50ID0gSW5maW5pdHk7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVlbC5lYXNpbmcucmVwZWF0KGxvb3BDb3VudCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVlbC5kZWZhdWx0TG9vcHMgPSBsb29wQ291bnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXG5cdH0sXG5cblx0LyoqQFxuXHQqICMucmVlbFBvc2l0aW9uXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCpcblx0KiBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbFBvc2l0aW9uKEludGVnZXIgcG9zaXRpb24pXG5cdCogU2V0cyB0aGUgcG9zaXRpb24gb2YgdGhlIGN1cnJlbnQgcmVlbCBieSBmcmFtZSBudW1iZXIuXG5cdCogQHBhcmFtIHBvc2l0aW9uIC0gdGhlIGZyYW1lIHRvIGp1bXAgdG8uICBUaGlzIGlzIHplcm8taW5kZXhlZC4gIEEgbmVnYXRpdmUgdmFsdWVzIGNvdW50cyBiYWNrIGZyb20gdGhlIGxhc3QgZnJhbWUuXG5cdCpcblx0KiBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbFBvc2l0aW9uKE51bWJlciBwb3NpdGlvbilcblx0KiBTZXRzIHRoZSBwb3NpdGlvbiBvZiB0aGUgY3VycmVudCByZWVsIGJ5IHBlcmNlbnQgcHJvZ3Jlc3MuXG5cdCogQHBhcmFtIHBvc2l0aW9uIC0gYSBub24taW50ZWdlciBudW1iZXIgYmV0d2VlbiAwIGFuZCAxXG5cdCpcblx0KiBAc2lnbiBwdWJsaWMgdGhpcyAucmVlbFBvc2l0aW9uKFN0cmluZyBwb3NpdGlvbilcblx0KiBKdW1wcyB0byB0aGUgc3BlY2lmaWVkIHBvc2l0aW9uLiAgVGhlIG9ubHkgY3VycmVudGx5IGFjY2VwdGVkIHZhbHVlIGlzIFwiZW5kXCIsIHdoaWNoIHdpbGwganVtcCB0byB0aGUgZW5kIG9mIHRoZSByZWVsLlxuXHQqXG5cdCogQHNpZ24gcHVibGljIE51bWJlciAucmVlbFBvc2l0aW9uKClcblx0KiBAcmV0dXJucyBUaGUgY3VycmVudCBmcmFtZSBudW1iZXJcblx0KlxuXHQqL1xuXHRyZWVsUG9zaXRpb246IGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZWVsID09PSBudWxsKVxuXHRcdFx0dGhyb3coXCJObyBhY3RpdmUgcmVlbC5cIik7XG5cblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50UmVlbC5jdXJyZW50RnJhbWU7XG5cblx0XHR2YXIgcHJvZ3Jlc3MsXG5cdFx0XHRsID0gdGhpcy5fY3VycmVudFJlZWwuZnJhbWVzLmxlbmd0aDtcblx0XHRpZiAocG9zaXRpb24gPT09IFwiZW5kXCIpXG5cdFx0XHRwb3NpdGlvbiA9IGwgLSAxO1xuXG5cdFx0aWYgKHBvc2l0aW9uIDwgMSAmJiBwb3NpdGlvbiA+IDApIHtcblx0XHRcdHByb2dyZXNzID0gcG9zaXRpb247XG5cdFx0XHRwb3NpdGlvbiA9IE1hdGguZmxvb3IobCAqIHByb2dyZXNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHBvc2l0aW9uICE9PSBNYXRoLmZsb29yKHBvc2l0aW9uKSlcblx0XHRcdFx0dGhyb3coXCJQb3NpdGlvbiBcIiArIHBvc2l0aW9uICsgXCIgaXMgaW52YWxpZC5cIik7XG5cdFx0XHRpZiAocG9zaXRpb24gPCAwKVxuXHRcdFx0XHRwb3NpdGlvbiA9IGwgLSAxICsgcG9zaXRpb247XG5cdFx0XHRwcm9ncmVzcyA9IHBvc2l0aW9uIC8gbDtcblx0XHR9XG5cdFx0Ly8gY2FwIHRvIGxhc3QgZnJhbWVcblx0XHRwb3NpdGlvbiA9IE1hdGgubWluKHBvc2l0aW9uLCBsLTEpO1xuXHRcdHBvc2l0aW9uID0gTWF0aC5tYXgocG9zaXRpb24sIDApO1xuXHRcdHRoaXMuX3NldFByb2dyZXNzKHByb2dyZXNzKTtcblx0XHR0aGlzLl9zZXRGcmFtZShwb3NpdGlvbik7XG5cblx0XHRyZXR1cm4gdGhpcztcblxuXHR9LFxuXG5cblx0Ly8gQm91bmQgdG8gXCJFbnRlckZyYW1lXCIuICBQcm9ncmVzc2VzIHRoZSBhbmltYXRpb24gYnkgZHQsIGNoYW5naW5nIHRoZSBmcmFtZSBpZiBuZWNlc3NhcnkuXG5cdC8vIGR0IGlzIG11bHRpcGxpZWQgYnkgdGhlIGFuaW1hdGlvblNwZWVkIHByb3BlcnR5XG5cdF9hbmltYXRpb25UaWNrOiBmdW5jdGlvbihmcmFtZURhdGEpIHtcblx0XHR2YXIgY3VycmVudFJlZWwgPSB0aGlzLl9yZWVsc1t0aGlzLl9jdXJyZW50UmVlbElkXTtcblx0XHRjdXJyZW50UmVlbC5lYXNpbmcudGljayhmcmFtZURhdGEuZHQgKiB0aGlzLmFuaW1hdGlvblNwZWVkKTtcblx0XHR2YXIgcHJvZ3Jlc3MgPSBjdXJyZW50UmVlbC5lYXNpbmcudmFsdWUoKTtcblx0XHR2YXIgZnJhbWVOdW1iZXIgPSBNYXRoLm1pbiggTWF0aC5mbG9vcihjdXJyZW50UmVlbC5mcmFtZXMubGVuZ3RoICogcHJvZ3Jlc3MpLCBjdXJyZW50UmVlbC5mcmFtZXMubGVuZ3RoIC0gMSk7XG5cblx0XHR0aGlzLl9zZXRGcmFtZShmcmFtZU51bWJlcik7XG5cblx0XHRpZihjdXJyZW50UmVlbC5lYXNpbmcuY29tcGxldGUgPT09IHRydWUpe1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiQW5pbWF0aW9uRW5kXCIsIHRoaXMuX2N1cnJlbnRSZWVsKTtcblx0XHRcdHRoaXMucGF1c2VBbmltYXRpb24oKTtcblx0XHR9XG5cdH0sXG5cblxuXG5cblxuXHQvLyBTZXQgdGhlIGN1cnJlbnQgZnJhbWUgYW5kIHVwZGF0ZSB0aGUgZGlzcGxheWVkIHNwcml0ZVxuXHQvLyBUaGUgYWN0dWFsIHByb2dyZXNzIGZvciB0aGUgYW5pbWF0aW9uIG11c3QgYmUgc2V0IHNlcGVyYXRlbHkuXG5cdF9zZXRGcmFtZTogZnVuY3Rpb24oZnJhbWVOdW1iZXIpIHtcblx0XHR2YXIgY3VycmVudFJlZWwgPSB0aGlzLl9jdXJyZW50UmVlbDtcblx0XHRpZiAoZnJhbWVOdW1iZXIgPT09IGN1cnJlbnRSZWVsLmN1cnJlbnRGcmFtZSlcblx0XHRcdHJldHVybjtcblx0XHRjdXJyZW50UmVlbC5jdXJyZW50RnJhbWUgPSBmcmFtZU51bWJlcjtcblx0XHR0aGlzLl91cGRhdGVTcHJpdGUoKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJGcmFtZUNoYW5nZVwiLCBjdXJyZW50UmVlbCk7XG5cdH0sXG5cblx0Ly8gVXBkYXRlIHRoZSBkaXNwbGF5ZWQgc3ByaXRlLlxuXHRfdXBkYXRlU3ByaXRlOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgY3VycmVudFJlZWwgPSB0aGlzLl9jdXJyZW50UmVlbDtcblx0XHR2YXIgcG9zID0gY3VycmVudFJlZWwuZnJhbWVzW2N1cnJlbnRSZWVsLmN1cnJlbnRGcmFtZV07XG5cdFx0dGhpcy5zcHJpdGUocG9zWzBdLCBwb3NbMV0pOyAvLyAuc3ByaXRlIHdpbGwgdHJpZ2dlciByZWRyYXdcblxuXHR9LFxuXG5cblx0Ly8gU2V0cyB0aGUgaW50ZXJuYWwgc3RhdGUgb2YgdGhlIGN1cnJlbnQgcmVlbCdzIGVhc2luZyBvYmplY3Rcblx0X3NldFByb2dyZXNzOiBmdW5jdGlvbihwcm9ncmVzcywgcmVwZWF0cykge1xuXHRcdHRoaXMuX2N1cnJlbnRSZWVsLmVhc2luZy5zZXRQcm9ncmVzcyhwcm9ncmVzcywgcmVwZWF0cyk7XG5cblx0fSxcblxuXG5cdC8qKkBcblx0KiAjLmlzUGxheWluZ1xuXHQqIEBjb21wIFNwcml0ZUFuaW1hdGlvblxuXHQqIEBzaWduIHB1YmxpYyBCb29sZWFuIC5pc1BsYXlpbmcoW1N0cmluZyByZWVsSWRdKVxuXHQqIEBwYXJhbSByZWVsSWQgLSBUaGUgcmVlbElkIG9mIHRoZSByZWVsIHdlIHdpc2ggdG8gZXhhbWluZVxuXHQqIEByZXR1cm5zIFRoZSBjdXJyZW50IGFuaW1hdGlvbiBzdGF0ZVxuXHQqXG5cdCogRGV0ZXJtaW5lcyBpZiB0aGUgc3BlY2lmaWVkIGFuaW1hdGlvbiBpcyBjdXJyZW50bHkgcGxheWluZy4gSWYgbm8gcmVlbElkIGlzIHNwZWNpZmllZCxcblx0KiBjaGVja3MgaWYgYW55IGFuaW1hdGlvbiBpcyBwbGF5aW5nLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiB+fn5cblx0KiBteUVudGl0eS5pc1BsYXlpbmcoKSAvLyBpcyBhbnkgYW5pbWF0aW9uIHBsYXlpbmdcblx0KiBteUVudGl0eS5pc1BsYXlpbmcoJ1BsYXllclJ1bm5pbmcnKSAvLyBpcyB0aGUgUGxheWVyUnVubmluZyBhbmltYXRpb24gcGxheWluZ1xuXHQqIH5+flxuXHQqL1xuXHRpc1BsYXlpbmc6IGZ1bmN0aW9uIChyZWVsSWQpIHtcblx0XHRpZiAoIXRoaXMuX2lzUGxheWluZykgcmV0dXJuIGZhbHNlO1xuXG5cdFx0aWYgKCFyZWVsSWQpIHJldHVybiAhIXRoaXMuX2N1cnJlbnRSZWVsSWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRSZWVsSWQgPT09IHJlZWxJZDtcblx0fSxcblxuXHQvKipAXG5cdCogIy5nZXRSZWVsXG5cdCogQGNvbXAgU3ByaXRlQW5pbWF0aW9uXG5cdCogQHNpZ24gcHVibGljIFJlZWwgLmdldFJlZWwoKVxuXHQqIEByZXR1cm5zIFRoZSBjdXJyZW50IHJlZWwsIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gYWN0aXZlIHJlZWxcblx0KlxuXHQqIEBzaWduIHB1YmxpYyBSZWVsIC5nZXRSZWVsKHJlZWxJZClcblx0KiBAcGFyYW0gcmVlbElkIC0gVGhlIGlkIG9mIHRoZSByZWVsIHRvIGZldGNoLlxuXHQqIEByZXR1cm5zIFRoZSBzcGVjaWZpZWQgcmVlbCwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gc3VjaCByZWVsIGV4aXN0cy5cblx0KlxuXHQqL1xuXHRnZXRSZWVsOiBmdW5jdGlvbiAocmVlbElkKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApe1xuXHRcdFx0aWYgKCF0aGlzLl9jdXJyZW50UmVlbElkKSByZXR1cm4gbnVsbDtcblx0XHRcdHJlZWxJZCA9IHRoaXMuX2N1cnJlbnRSZWVsSWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlZWxzW3JlZWxJZF07XG5cdH1cbn0pO1xuXG4vKipAXG4gKiAjVHdlZW5cbiAqIEBjYXRlZ29yeSBBbmltYXRpb25cbiAqIEB0cmlnZ2VyIFR3ZWVuRW5kIC0gd2hlbiBhIHR3ZWVuIGZpbmlzaGVzIC0gU3RyaW5nIC0gcHJvcGVydHlcbiAqXG4gKiBDb21wb25lbnQgdG8gYW5pbWF0ZSB0aGUgY2hhbmdlIGluIDJEIHByb3BlcnRpZXMgb3ZlciB0aW1lLlxuICovXG5DcmFmdHkuYyhcIlR3ZWVuXCIsIHtcblxuXHRpbml0OiBmdW5jdGlvbigpe1xuXHRcdHRoaXMudHdlZW5Hcm91cCA9IHt9O1xuXHRcdHRoaXMudHdlZW5TdGFydCA9IHt9O1xuXHRcdHRoaXMudHdlZW5zID0gW107XG5cdFx0dGhpcy5iaW5kKFwiRW50ZXJGcmFtZVwiLCB0aGlzLl90d2VlblRpY2spO1xuXG5cdH0sXG5cblx0X3R3ZWVuVGljazogZnVuY3Rpb24oZnJhbWVEYXRhKXtcblx0XHR2YXIgdHdlZW4sIHYsIGk7XG5cdFx0Zm9yICggaSA9IHRoaXMudHdlZW5zLmxlbmd0aC0xOyBpPj0wOyBpLS0pe1xuXHRcdFx0dHdlZW4gPSB0aGlzLnR3ZWVuc1tpXTtcblx0XHRcdHR3ZWVuLmVhc2luZy50aWNrKGZyYW1lRGF0YS5kdCk7XG5cdFx0XHR2ICA9IHR3ZWVuLmVhc2luZy52YWx1ZSgpO1xuXHRcdFx0dGhpcy5fZG9Ud2Vlbih0d2Vlbi5wcm9wcywgdik7XG5cdFx0XHRpZiAodHdlZW4uZWFzaW5nLmNvbXBsZXRlKSB7XG5cdFx0XHRcdHRoaXMudHdlZW5zLnNwbGljZShpLCAxKTtcblx0XHRcdFx0dGhpcy5fZW5kVHdlZW4odHdlZW4ucHJvcHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRfZG9Ud2VlbjogZnVuY3Rpb24ocHJvcHMsIHYpe1xuXHRcdGZvciAodmFyIG5hbWUgaW4gcHJvcHMpXG5cdFx0XHR0aGlzW25hbWVdID0gKDEtdikgKiB0aGlzLnR3ZWVuU3RhcnRbbmFtZV0gKyB2ICogcHJvcHNbbmFtZV07XG5cblx0fSxcblxuXG5cblx0LyoqQFxuXHQqICMudHdlZW5cblx0KiBAY29tcCBUd2VlblxuXHQqIEBzaWduIHB1YmxpYyB0aGlzIC50d2VlbihPYmplY3QgcHJvcGVydGllcywgTnVtYmVyfFN0cmluZyBkdXJhdGlvbilcblx0KiBAcGFyYW0gcHJvcGVydGllcyAtIE9iamVjdCBvZiBudW1lcmljIHByb3BlcnRpZXMgYW5kIHdoYXQgdGhleSBzaG91bGQgYW5pbWF0ZSB0b1xuXHQqIEBwYXJhbSBkdXJhdGlvbiAtIER1cmF0aW9uIHRvIGFuaW1hdGUgdGhlIHByb3BlcnRpZXMgb3ZlciwgaW4gbWlsbGlzZWNvbmRzLlxuXHQqXG5cdCogVGhpcyBtZXRob2Qgd2lsbCBhbmltYXRlIG51bWVyaWMgcHJvcGVydGllcyBvdmVyIHRoZSBzcGVjaWZpZWQgZHVyYXRpb24uXG5cdCogVGhlc2UgaW5jbHVkZSBgeGAsIGB5YCwgYHdgLCBgaGAsIGBhbHBoYWAgYW5kIGByb3RhdGlvbmAuXG5cdCpcblx0KiBUaGUgb2JqZWN0IHBhc3NlZCBzaG91bGQgaGF2ZSB0aGUgcHJvcGVydGllcyBhcyBrZXlzIGFuZCB0aGUgdmFsdWUgc2hvdWxkIGJlIHRoZSByZXN1bHRpbmdcblx0KiB2YWx1ZXMgb2YgdGhlIHByb3BlcnRpZXMuICBUaGUgcGFzc2VkIG9iamVjdCBtaWdodCBiZSBtb2RpZmllZCBpZiBsYXRlciBjYWxscyB0byB0d2VlbiBhbmltYXRlIHRoZSBzYW1lIHByb3BlcnRpZXMuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqIE1vdmUgYW4gb2JqZWN0IHRvIDEwMCwxMDAgYW5kIGZhZGUgb3V0IG92ZXIgMjAwIG1zLlxuXHQqIH5+flxuXHQqIENyYWZ0eS5lKFwiMkQsIFR3ZWVuXCIpXG5cdCogICAgLmF0dHIoe2FscGhhOiAxLjAsIHg6IDAsIHk6IDB9KVxuXHQqICAgIC50d2Vlbih7YWxwaGE6IDAuMCwgeDogMTAwLCB5OiAxMDB9LCAyMDApXG5cdCogfn5+XG5cdCogQGV4YW1wbGVcblx0KiBSb3RhdGUgYW4gb2JqZWN0IG92ZXIgMiBzZWNvbmRzXG5cdCogfn5+XG5cdCogQ3JhZnR5LmUoXCIyRCwgVHdlZW5cIilcblx0KiAgICAuYXR0cih7cm90YXRlOjB9KVxuXHQqICAgIC50d2Vlbih7cm90YXRlOjE4MH0sIDIwMDApXG5cdCogfn5+XG5cdCpcblx0Ki9cblx0dHdlZW46IGZ1bmN0aW9uIChwcm9wcywgZHVyYXRpb24pIHtcblxuXHRcdHZhciB0d2VlbiA9IHtcblx0XHRcdHByb3BzOiBwcm9wcyxcblx0XHRcdGVhc2luZzogbmV3IENyYWZ0eS5lYXNpbmcoZHVyYXRpb24pXG5cdFx0fTtcblxuXHRcdC8vIFR3ZWVucyBhcmUgZ3JvdXBlZCB0b2dldGhlciBieSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24gY2FsbC5cblx0XHQvLyBJbmRpdmlkdWFsIHByb3BlcnRpZXMgbXVzdCBiZWxvbmcgdG8gb25seSBhIHNpbmdsZSBncm91cFxuXHRcdC8vIFdoZW4gYSBuZXcgdHdlZW4gc3RhcnRzLCBpZiBpdCBhbHJlYWR5IGJlbG9uZ3MgdG8gYSBncm91cCwgbW92ZSBpdCB0byB0aGUgbmV3IG9uZVxuXHRcdC8vIFJlY29yZCB0aGUgZ3JvdXAgaXQgY3VycmVudGx5IGJlbG9uZ3MgdG8sIGFzIHdlbGwgYXMgaXRzIHN0YXJ0aW5nIGNvb3JkaW5hdGUuXG5cdFx0Zm9yICh2YXIgcHJvcG5hbWUgaW4gcHJvcHMpe1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLnR3ZWVuR3JvdXBbcHJvcG5hbWVdICE9PSBcInVuZGVmaW5lZFwiKVxuXHRcdFx0XHR0aGlzLmNhbmNlbFR3ZWVuKHByb3BuYW1lKTtcblx0XHRcdHRoaXMudHdlZW5TdGFydFtwcm9wbmFtZV0gPSB0aGlzW3Byb3BuYW1lXTtcblx0XHRcdHRoaXMudHdlZW5Hcm91cFtwcm9wbmFtZV0gPSBwcm9wcztcblx0XHR9XG5cdFx0dGhpcy50d2VlbnMucHVzaCh0d2Vlbik7XG5cblx0XHRyZXR1cm4gdGhpcztcblxuXHR9LFxuXG5cdC8qKkBcblx0KiAjLmNhbmNlbFR3ZWVuXG5cdCogQGNvbXAgVHdlZW5cblx0KiBAc2lnbiBwdWJsaWMgdGhpcyAuY2FuY2VsVHdlZW4oU3RyaW5nIHRhcmdldClcblx0KiBAcGFyYW0gdGFyZ2V0IC0gVGhlIHByb3BlcnR5IHRvIGNhbmNlbFxuXHQqXG5cdCogQHNpZ24gcHVibGljIHRoaXMgLmNhbmNlbFR3ZWVuKE9iamVjdCB0YXJnZXQpXG5cdCogQHBhcmFtIHRhcmdldCAtIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSBwcm9wZXJ0aWVzIHRvIGNhbmNlbC5cblx0KlxuXHQqIFN0b3BzIHR3ZWVuaW5nIHRoZSBzcGVjaWZpZWQgcHJvcGVydHkgb3IgcHJvcGVydGllcy5cblx0KiBQYXNzaW5nIHRoZSBvYmplY3QgdXNlZCB0byBzdGFydCB0aGUgdHdlZW4gbWlnaHQgYmUgYSB0eXBpY2FsIHVzZSBvZiB0aGUgc2Vjb25kIHNpZ25hdHVyZS5cblx0Ki9cblx0Y2FuY2VsVHdlZW46IGZ1bmN0aW9uKHRhcmdldCl7XG5cdFx0aWYgKHR5cGVvZiB0YXJnZXQgPT09IFwic3RyaW5nXCIpe1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLnR3ZWVuR3JvdXBbdGFyZ2V0XSA9PSBcIm9iamVjdFwiIClcblx0XHRcdFx0ZGVsZXRlIHRoaXMudHdlZW5Hcm91cFt0YXJnZXRdW3RhcmdldF07XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0ID09PSBcIm9iamVjdFwiKSB7XG5cdFx0XHRmb3IgKHZhciBwcm9wbmFtZSBpbiB0YXJnZXQpXG5cdFx0XHRcdHRoaXMuY2FuY2VsVHdlZW4ocHJvcG5hbWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXG5cdH0sXG5cblx0Lypcblx0KiBTdG9wcyB0d2VlbmluZyB0aGUgc3BlY2lmaWVkIGdyb3VwIG9mIHByb3BlcnRpZXMsIGFuZCBmaXJlcyB0aGUgXCJUd2VlbkVuZFwiIGV2ZW50LlxuXHQqL1xuXHRfZW5kVHdlZW46IGZ1bmN0aW9uKHByb3BlcnRpZXMpe1xuXHRcdGZvciAodmFyIHByb3BuYW1lIGluIHByb3BlcnRpZXMpe1xuXHRcdFx0ZGVsZXRlIHRoaXMudHdlZW5Hcm91cFtwcm9wbmFtZV07XG5cdFx0fVxuXHRcdHRoaXMudHJpZ2dlcihcIlR3ZWVuRW5kXCIsIHByb3BlcnRpZXMpO1xuXHR9XG59KTtcbiIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuLyoqQFxuICogI0NhbnZhc1xuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBAdHJpZ2dlciBEcmF3IC0gd2hlbiB0aGUgZW50aXR5IGlzIHJlYWR5IHRvIGJlIGRyYXduIHRvIHRoZSBzdGFnZSAtIHt0eXBlOiBcImNhbnZhc1wiLCBwb3MsIGNvLCBjdHh9XG4gKiBAdHJpZ2dlciBOb0NhbnZhcyAtIGlmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY2FudmFzXG4gKlxuICogV2hlbiB0aGlzIGNvbXBvbmVudCBpcyBhZGRlZCB0byBhbiBlbnRpdHkgaXQgd2lsbCBiZSBkcmF3biB0byB0aGUgZ2xvYmFsIGNhbnZhcyBlbGVtZW50LiBUaGUgY2FudmFzIGVsZW1lbnQgKGFuZCBoZW5jZSBhbGwgQ2FudmFzIGVudGl0aWVzKSBpcyBhbHdheXMgcmVuZGVyZWQgYmVsb3cgYW55IERPTSBlbnRpdGllcy5cbiAqXG4gKiBDcmFmdHkuY2FudmFzLmluaXQoKSB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgY2FsbGVkIGlmIGl0IGlzIG5vdCBjYWxsZWQgYWxyZWFkeSB0byBpbml0aWFsaXplIHRoZSBjYW52YXMgZWxlbWVudC5cbiAqXG4gKiBDcmVhdGUgYSBjYW52YXMgZW50aXR5IGxpa2UgdGhpc1xuICogfn5+XG4gKiB2YXIgbXlFbnRpdHkgPSBDcmFmdHkuZShcIjJELCBDYW52YXMsIENvbG9yXCIpXG4gKiAgICAgIC5jb2xvcihcImdyZWVuXCIpXG4gKiAgICAgIC5hdHRyKHt4OiAxMywgeTogMzcsIHc6IDQyLCBoOiA0Mn0pO1xuICp+fn5cbiAqL1xuQ3JhZnR5LmMoXCJDYW52YXNcIiwge1xuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIUNyYWZ0eS5jYW52YXMuY29udGV4dCkge1xuICAgICAgICAgICAgQ3JhZnR5LmNhbnZhcy5pbml0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2luY3JlbWVudCB0aGUgYW1vdW50IG9mIGNhbnZhcyBvYmpzXG4gICAgICAgIENyYWZ0eS5EcmF3TWFuYWdlci50b3RhbDJEKys7XG4gICAgICAgIC8vQWxsb2NhdGUgYW4gb2JqZWN0IHRvIGhvbGQgdGhpcyBjb21wb25lbnRzIGN1cnJlbnQgcmVnaW9uXG4gICAgICAgIHRoaXMuY3VycmVudFJlY3QgPSB7fTtcbiAgICAgICAgdGhpcy5fY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIENyYWZ0eS5EcmF3TWFuYWdlci5hZGRDYW52YXModGhpcyk7XG5cbiAgICAgICAgdGhpcy5iaW5kKFwiSW52YWxpZGF0ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgLy9mbGFnIGlmIGNoYW5nZWRcbiAgICAgICAgICAgIGlmICh0aGlzLl9jaGFuZ2VkID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIENyYWZ0eS5EcmF3TWFuYWdlci5hZGRDYW52YXModGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSk7XG5cblxuICAgICAgICB0aGlzLmJpbmQoXCJSZW1vdmVcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgQ3JhZnR5LkRyYXdNYW5hZ2VyLnRvdGFsMkQtLTtcbiAgICAgICAgICAgIHRoaXMuX2NoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgQ3JhZnR5LkRyYXdNYW5hZ2VyLmFkZENhbnZhcyh0aGlzKTtcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmRyYXdcbiAgICAgKiBAY29tcCBDYW52YXNcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuZHJhdyhbW0NvbnRleHQgY3R4LCBdTnVtYmVyIHgsIE51bWJlciB5LCBOdW1iZXIgdywgTnVtYmVyIGhdKVxuICAgICAqIEBwYXJhbSBjdHggLSBDYW52YXMgMkQgY29udGV4dCBpZiBkcmF3aW5nIG9uIGFub3RoZXIgY2FudmFzIGlzIHJlcXVpcmVkXG4gICAgICogQHBhcmFtIHggLSBYIG9mZnNldCBmb3IgZHJhd2luZyBhIHNlZ21lbnRcbiAgICAgKiBAcGFyYW0geSAtIFkgb2Zmc2V0IGZvciBkcmF3aW5nIGEgc2VnbWVudFxuICAgICAqIEBwYXJhbSB3IC0gV2lkdGggb2YgdGhlIHNlZ21lbnQgdG8gZHJhd1xuICAgICAqIEBwYXJhbSBoIC0gSGVpZ2h0IG9mIHRoZSBzZWdtZW50IHRvIGRyYXdcbiAgICAgKlxuICAgICAqIE1ldGhvZCB0byBkcmF3IHRoZSBlbnRpdHkgb24gdGhlIGNhbnZhcyBlbGVtZW50LiBDYW4gcGFzcyByZWN0IHZhbHVlcyBmb3IgcmVkcmF3aW5nIGEgc2VnbWVudCBvZiB0aGUgZW50aXR5LlxuICAgICAqL1xuXG4gICAgLy8gQ2FjaGUgdGhlIHZhcmlvdXMgb2JqZWN0cyBhbmQgYXJyYXlzIHVzZWQgaW4gZHJhdzpcbiAgICBkcmF3VmFyczoge1xuICAgICAgICB0eXBlOiBcImNhbnZhc1wiLFxuICAgICAgICBwb3M6IHt9LFxuICAgICAgICBjdHg6IG51bGwsXG4gICAgICAgIGNvb3JkOiBbMCwgMCwgMCwgMF0sXG4gICAgICAgIGNvOiB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMCxcbiAgICAgICAgICAgIHc6IDAsXG4gICAgICAgICAgICBoOiAwXG4gICAgICAgIH1cblxuXG4gICAgfSxcblxuICAgIGRyYXc6IGZ1bmN0aW9uIChjdHgsIHgsIHksIHcsIGgpIHtcbiAgICAgICAgaWYgKCF0aGlzLnJlYWR5KSByZXR1cm47XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSA0KSB7XG4gICAgICAgICAgICBoID0gdztcbiAgICAgICAgICAgIHcgPSB5O1xuICAgICAgICAgICAgeSA9IHg7XG4gICAgICAgICAgICB4ID0gY3R4O1xuICAgICAgICAgICAgY3R4ID0gQ3JhZnR5LmNhbnZhcy5jb250ZXh0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKCdkcmF3Jyk7XG5cbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuZHJhd1ZhcnMucG9zO1xuICAgICAgICBwb3MuX3ggPSAodGhpcy5feCArICh4IHx8IDApKTtcbiAgICAgICAgcG9zLl95ID0gKHRoaXMuX3kgKyAoeSB8fCAwKSk7XG4gICAgICAgIHBvcy5fdyA9ICh3IHx8IHRoaXMuX3cpO1xuICAgICAgICBwb3MuX2ggPSAoaCB8fCB0aGlzLl9oKTtcblxuXG4gICAgICAgIGNvbnRleHQgPSBjdHggfHwgQ3JhZnR5LmNhbnZhcy5jb250ZXh0O1xuICAgICAgICBjb29yZCA9IHRoaXMuX19jb29yZCB8fCBbMCwgMCwgMCwgMF07XG4gICAgICAgIHZhciBjbyA9IHRoaXMuZHJhd1ZhcnMuY287XG4gICAgICAgIGNvLnggPSBjb29yZFswXSArICh4IHx8IDApO1xuICAgICAgICBjby55ID0gY29vcmRbMV0gKyAoeSB8fCAwKTtcbiAgICAgICAgY28udyA9IHcgfHwgY29vcmRbMl07XG4gICAgICAgIGNvLmggPSBoIHx8IGNvb3JkWzNdO1xuXG4gICAgICAgIGlmICh0aGlzLl9yb3RhdGlvbiAhPT0gMCkge1xuICAgICAgICAgICAgY29udGV4dC5zYXZlKCk7XG5cbiAgICAgICAgICAgIGNvbnRleHQudHJhbnNsYXRlKHRoaXMuX29yaWdpbi54ICsgdGhpcy5feCwgdGhpcy5fb3JpZ2luLnkgKyB0aGlzLl95KTtcbiAgICAgICAgICAgIHBvcy5feCA9IC10aGlzLl9vcmlnaW4ueDtcbiAgICAgICAgICAgIHBvcy5feSA9IC10aGlzLl9vcmlnaW4ueTtcblxuICAgICAgICAgICAgY29udGV4dC5yb3RhdGUoKHRoaXMuX3JvdGF0aW9uICUgMzYwKSAqIChNYXRoLlBJIC8gMTgwKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fZmxpcFggfHwgdGhpcy5fZmxpcFkpIHtcbiAgICAgICAgICAgIGNvbnRleHQuc2F2ZSgpO1xuICAgICAgICAgICAgY29udGV4dC5zY2FsZSgodGhpcy5fZmxpcFggPyAtMSA6IDEpLCAodGhpcy5fZmxpcFkgPyAtMSA6IDEpKTtcbiAgICAgICAgICAgIGlmICh0aGlzLl9mbGlwWCkge1xuICAgICAgICAgICAgICAgIHBvcy5feCA9IC0ocG9zLl94ICsgcG9zLl93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLl9mbGlwWSkge1xuICAgICAgICAgICAgICAgIHBvcy5feSA9IC0ocG9zLl95ICsgcG9zLl9oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBnbG9iYWxwaGE7XG5cbiAgICAgICAgLy9kcmF3IHdpdGggYWxwaGFcbiAgICAgICAgaWYgKHRoaXMuX2FscGhhIDwgMS4wKSB7XG4gICAgICAgICAgICBnbG9iYWxwaGEgPSBjb250ZXh0Lmdsb2JhbEFscGhhO1xuICAgICAgICAgICAgY29udGV4dC5nbG9iYWxBbHBoYSA9IHRoaXMuX2FscGhhO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5kcmF3VmFycy5jdHggPSBjb250ZXh0O1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJEcmF3XCIsIHRoaXMuZHJhd1ZhcnMpO1xuXG4gICAgICAgIGlmICh0aGlzLl9yb3RhdGlvbiAhPT0gMCB8fCAodGhpcy5fZmxpcFggfHwgdGhpcy5fZmxpcFkpKSB7XG4gICAgICAgICAgICBjb250ZXh0LnJlc3RvcmUoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ2xvYmFscGhhKSB7XG4gICAgICAgICAgICBjb250ZXh0Lmdsb2JhbEFscGhhID0gZ2xvYmFscGhhO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjQ3JhZnR5LmNhbnZhc1xuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKlxuICogQ29sbGVjdGlvbiBvZiBtZXRob2RzIHRvIGRyYXcgb24gY2FudmFzLlxuICovXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICBjYW52YXM6IHtcbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmNhbnZhcy5jb250ZXh0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5jYW52YXNcbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyB3aWxsIHJldHVybiB0aGUgMkQgY29udGV4dCBvZiB0aGUgbWFpbiBjYW52YXMgZWxlbWVudC5cbiAgICAgICAgICogVGhlIHZhbHVlIHJldHVybmVkIGZyb20gYENyYWZ0eS5jYW52YXMuX2NhbnZhcy5nZXRDb250ZXh0KCcyZCcpYC5cbiAgICAgICAgICovXG4gICAgICAgIGNvbnRleHQ6IG51bGwsXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5jYW52YXMuX2NhbnZhc1xuICAgICAgICAgKiBAY29tcCBDcmFmdHkuY2FudmFzXG4gICAgICAgICAqXG4gICAgICAgICAqIE1haW4gQ2FudmFzIGVsZW1lbnRcbiAgICAgICAgICovXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmNhbnZhcy5pbml0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5jYW52YXNcbiAgICAgICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5LmNhbnZhcy5pbml0KHZvaWQpXG4gICAgICAgICAqIEB0cmlnZ2VyIE5vQ2FudmFzIC0gdHJpZ2dlcmVkIGlmIGBDcmFmdHkuc3VwcG9ydC5jYW52YXNgIGlzIGZhbHNlXG4gICAgICAgICAqXG4gICAgICAgICAqIENyZWF0ZXMgYSBgY2FudmFzYCBlbGVtZW50IGluc2lkZSBgQ3JhZnR5LnN0YWdlLmVsZW1gLiBNdXN0IGJlIGNhbGxlZFxuICAgICAgICAgKiBiZWZvcmUgYW55IGVudGl0aWVzIHdpdGggdGhlIENhbnZhcyBjb21wb25lbnQgY2FuIGJlIGRyYXduLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIG1ldGhvZCB3aWxsIGF1dG9tYXRpY2FsbHkgYmUgY2FsbGVkIGlmIG5vIGBDcmFmdHkuY2FudmFzLmNvbnRleHRgIGlzXG4gICAgICAgICAqIGZvdW5kLlxuICAgICAgICAgKi9cbiAgICAgICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy9jaGVjayBpZiBjYW52YXMgaXMgc3VwcG9ydGVkXG4gICAgICAgICAgICBpZiAoIUNyYWZ0eS5zdXBwb3J0LmNhbnZhcykge1xuICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiTm9DYW52YXNcIik7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnN0b3AoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vY3JlYXRlIGFuIGVtcHR5IGNhbnZhcyBlbGVtZW50XG5cbiAgICAgICAgICAgIC8vU2V0IGFueSBleGlzdGluZyB0cmFuc2Zvcm1hdGlvbnNcbiAgICAgICAgICAgIHZhciB6b29tID0gQ3JhZnR5LnZpZXdwb3J0Ll9zY2FsZTtcbiAgICAgICAgICAgIGlmICh6b29tICE9IDEpXG4gICAgICAgICAgICAgICAgQ3JhZnR5LmNhbnZhcy5jb250ZXh0LnNjYWxlKHpvb20sIHpvb20pO1xuXG4gICAgICAgICAgICAvL0JpbmQgcmVuZGVyaW5nIG9mIGNhbnZhcyBjb250ZXh0IChzZWUgZHJhd2luZy5qcylcbiAgICAgICAgICAgIENyYWZ0eS51bmlxdWVCaW5kKFwiUmVuZGVyU2NlbmVcIiwgQ3JhZnR5LkRyYXdNYW5hZ2VyLnJlbmRlckNhbnZhcyk7XG5cbiAgICAgICAgICAgIENyYWZ0eS51bmlxdWVCaW5kKFwiVmlld3BvcnRSZXNpemVcIiwgdGhpcy5fcmVzaXplKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBSZXNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHRvIHRoZSBjdXJyZW50IHZpZXdwb3J0XG4gICAgICAgIF9yZXNpemU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGMgPSBDcmFmdHkuY2FudmFzLl9jYW52YXM7XG4gICAgICAgICAgICBjLndpZHRoID0gQ3JhZnR5LnZpZXdwb3J0LndpZHRoO1xuICAgICAgICAgICAgYy5oZWlnaHQgPSBDcmFmdHkudmlld3BvcnQuaGVpZ2h0O1xuXG4gICAgICAgIH1cblxuICAgIH1cbn0pO1xuIiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50LFxuICAgIERFR19UT19SQUQgPSBNYXRoLlBJIC8gMTgwO1xuXG4vKipAXG4gKiAjQ29sbGlzaW9uXG4gKiBAY2F0ZWdvcnkgMkRcbiAqIENvbXBvbmVudCB0byBkZXRlY3QgY29sbGlzaW9uIGJldHdlZW4gYW55IHR3byBjb252ZXggcG9seWdvbnMuXG4gKi9cbkNyYWZ0eS5jKFwiQ29sbGlzaW9uXCIsIHtcbiAgICAvKipAXG4gICAgICogIy5pbml0XG4gICAgICogQGNvbXAgQ29sbGlzaW9uXG4gICAgICogQ3JlYXRlIGEgcmVjdGFuZ2xlIHBvbHlnb24gYmFzZWQgb24gdGhlIHgsIHksIHcsIGggZGltZW5zaW9ucy5cbiAgICAgKlxuICAgICAqIEJ5IGRlZmF1bHQsIHRoZSBjb2xsaXNpb24gaGl0Ym94IHdpbGwgbWF0Y2ggdGhlIGRpbWVuc2lvbnMgKHgsIHksIHcsIGgpIGFuZCByb3RhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAqL1xuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZXF1aXJlcyhcIjJEXCIpO1xuICAgICAgICB0aGlzLmNvbGxpc2lvbigpO1xuICAgIH0sXG5cblxuICAgIC8vIFJ1biBieSBDcmFmdHkgd2hlbiB0aGUgY29tcG9uZW50IGlzIHJlbW92ZWRcbiAgICByZW1vdmU6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLl9jYnIgPSBudWxsO1xuICAgICAgICB0aGlzLnVuYmluZChcIlJlc2l6ZVwiLCB0aGlzLl9yZXNpemVNYXApO1xuICAgICAgICB0aGlzLnVuYmluZChcIlJlc2l6ZVwiLCB0aGlzLl9jaGVja0JvdW5kcyk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmNvbGxpc2lvblxuICAgICAqIEBjb21wIENvbGxpc2lvblxuICAgICAqXG4gICAgICogQHRyaWdnZXIgTmV3SGl0Ym94IC0gd2hlbiBhIG5ldyBoaXRib3ggaXMgYXNzaWduZWQgLSBDcmFmdHkucG9seWdvblxuICAgICAqXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmNvbGxpc2lvbihbQ3JhZnR5LnBvbHlnb24gcG9seWdvbl0pXG4gICAgICogQHBhcmFtIHBvbHlnb24gLSBDcmFmdHkucG9seWdvbiBvYmplY3QgdGhhdCB3aWxsIGFjdCBhcyB0aGUgaGl0IGFyZWFcbiAgICAgKlxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5jb2xsaXNpb24oQXJyYXkgcG9pbnQxLCAuLiwgQXJyYXkgcG9pbnROKVxuICAgICAqIEBwYXJhbSBwb2ludCMgLSBBcnJheSB3aXRoIGFuIGB4YCBhbmQgYHlgIHBvc2l0aW9uIHRvIGdlbmVyYXRlIGEgcG9seWdvblxuICAgICAqXG4gICAgICogQ29uc3RydWN0b3IgdGFrZXMgYSBwb2x5Z29uIG9yIGFycmF5IG9mIHBvaW50cyB0byB1c2UgYXMgdGhlIGhpdCBhcmVhLlxuICAgICAqXG4gICAgICogVGhlIGhpdCBhcmVhIChwb2x5Z29uKSBtdXN0IGJlIGEgY29udmV4IHNoYXBlIGFuZCBub3QgY29uY2F2ZVxuICAgICAqIGZvciB0aGUgY29sbGlzaW9uIGRldGVjdGlvbiB0byB3b3JrLlxuICAgICAqXG4gICAgICogUG9pbnRzIGFyZSByZWxhdGl2ZSB0byB0aGUgb2JqZWN0J3MgcG9zaXRpb24gYW5kIGl0cyB1bnJvdGF0ZWQgc3RhdGUuXG4gICAgICpcbiAgICAgKiBJZiBubyBwYXJhbWV0ZXIgaXMgcGFzc2VkLCB0aGUgeCwgeSwgdywgaCBwcm9wZXJ0aWVzIG9mIHRoZSBlbnRpdHkgd2lsbCBiZSB1c2VkLCBhbmQgdGhlIGhpdGJveCB3aWxsIGJlIHJlc2l6ZWQgd2hlbiB0aGUgZW50aXR5IGlzLlxuICAgICAqXG4gICAgICogSWYgYSBoaXRib3ggaXMgc2V0IHRoYXQgaXMgb3V0c2lkZSBvZiB0aGUgYm91bmRzIG9mIHRoZSBlbnRpdHkgaXRzZWxmLCB0aGVyZSB3aWxsIGJlIGEgc21hbGwgcGVyZm9ybWFuY2UgcGVuYWx0eSBhcyBpdCBpcyB0cmFja2VkIHNlcGFyYXRlbHkuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiMkQsIENvbGxpc2lvblwiKS5jb2xsaXNpb24oXG4gICAgICogICAgIG5ldyBDcmFmdHkucG9seWdvbihbNTAsMF0sIFsxMDAsMTAwXSwgWzAsMTAwXSlcbiAgICAgKiApO1xuICAgICAqXG4gICAgICogQ3JhZnR5LmUoXCIyRCwgQ29sbGlzaW9uXCIpLmNvbGxpc2lvbihbNTAsMF0sIFsxMDAsMTAwXSwgWzAsMTAwXSk7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5wb2x5Z29uXG4gICAgICovXG4gICAgY29sbGlzaW9uOiBmdW5jdGlvbiAocG9seSkge1xuICAgICAgICAvLyBVbmJpbmQgYW55dGhpbmcgYm91bmQgdG8gXCJSZXNpemVcIlxuICAgICAgICB0aGlzLnVuYmluZChcIlJlc2l6ZVwiLCB0aGlzLl9yZXNpemVNYXApO1xuICAgICAgICB0aGlzLnVuYmluZChcIlJlc2l6ZVwiLCB0aGlzLl9jaGVja0JvdW5kcyk7XG5cbiAgICAgICAgXG5cbiAgICAgICAgaWYgKCFwb2x5KSB7XG4gICAgICAgICAgICAvLyBJZiBubyBwb2x5Z29uIGlzIHNwZWNpZmllZCwgdGhlbiBhIHBvbHlnb24gaXMgY3JlYXRlZCB0aGF0IG1hdGNoZXMgdGhlIGJvdW5kcyBvZiB0aGUgZW50aXR5XG4gICAgICAgICAgICAvLyBJdCB3aWxsIGJlIGFkanVzdGVkIG9uIGEgXCJSZXNpemVcIiBldmVudFxuICAgICAgICAgICAgcG9seSA9IG5ldyBDcmFmdHkucG9seWdvbihbMCwgMF0sIFt0aGlzLl93LCAwXSwgW3RoaXMuX3csIHRoaXMuX2hdLCBbMCwgdGhpcy5faF0pO1xuICAgICAgICAgICAgdGhpcy5iaW5kKFwiUmVzaXplXCIsIHRoaXMuX3Jlc2l6ZU1hcCk7XG4gICAgICAgICAgICB0aGlzLl9jYnIgPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCB3ZSBzZXQgdGhlIHNwZWNpZmllZCBoaXRib3gsIGNvbnZlcnRpbmcgZnJvbSBhIGxpc3Qgb2YgYXJndW1lbnRzIHRvIGEgcG9seWdvbiBpZiBuZWNlc3NhcnlcbiAgICAgICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgIC8vY29udmVydCBhcmdzIHRvIGFycmF5IHRvIGNyZWF0ZSBwb2x5Z29uXG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICAgICAgICAgICAgICAgIHBvbHkgPSBuZXcgQ3JhZnR5LnBvbHlnb24oYXJncyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBDaGVjayB0byBzZWUgaWYgdGhlIHBvbHlnb24gc2l0cyBvdXRzaWRlIHRoZSBlbnRpdHksIGFuZCBzZXQgX2NiciBhcHByb3ByaWF0ZWx5XG4gICAgICAgICAgICAvLyBPbiByZXNpemUsIHRoZSBuZXcgYm91bmRzIHdpbGwgYmUgY2hlY2tlZCBpZiBuZWNlc3NhcnlcbiAgICAgICAgICAgIHRoaXMuX2ZpbmRCb3VuZHMocG9seS5wb2ludHMpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBJZiB0aGUgZW50aXR5IGlzIGN1cnJlbnRseSByb3RhdGVkLCB0aGUgcG9pbnRzIGluIHRoZSBoaXRib3ggbXVzdCBhbHNvIGJlIHJvdGF0ZWRcbiAgICAgICAgaWYgKHRoaXMucm90YXRpb24pIHtcbiAgICAgICAgICAgIHBvbHkucm90YXRlKHtcbiAgICAgICAgICAgICAgICBjb3M6IE1hdGguY29zKC10aGlzLnJvdGF0aW9uICogREVHX1RPX1JBRCksXG4gICAgICAgICAgICAgICAgc2luOiBNYXRoLnNpbigtdGhpcy5yb3RhdGlvbiAqIERFR19UT19SQUQpLFxuICAgICAgICAgICAgICAgIG86IHtcbiAgICAgICAgICAgICAgICAgICAgeDogdGhpcy5fb3JpZ2luLngsXG4gICAgICAgICAgICAgICAgICAgIHk6IHRoaXMuX29yaWdpbi55XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5LCBhc3NpZ24gdGhlIGhpdGJveCwgYW5kIGF0dGFjaCBpdCB0byB0aGUgXCJDb2xsaXNpb25cIiBlbnRpdHlcbiAgICAgICAgdGhpcy5tYXAgPSBwb2x5O1xuICAgICAgICB0aGlzLmF0dGFjaCh0aGlzLm1hcCk7XG4gICAgICAgIHRoaXMubWFwLnNoaWZ0KHRoaXMuX3gsIHRoaXMuX3kpO1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJOZXdIaXRib3hcIiwgcG9seSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cblxuICAgIC8vIElmIHRoZSBoaXRib3ggaXMgc2V0IGJ5IGhhbmQsIGl0IG1pZ2h0IGV4dGVuZCBiZXlvbmQgdGhlIGVudGl0eS5cbiAgICAvLyBJbiBzdWNoIGEgY2FzZSwgd2UgbmVlZCB0byB0cmFjayB0aGlzIHNlcGFyYXRlbHkuXG4gICAgLy8gVGhpcyBmdW5jdGlvbiBmaW5kcyBhIChub24tbWluaW1hbCkgYm91bmRpbmcgY2lyY2xlIGFyb3VuZCB0aGUgaGl0Ym94LlxuICAgIC8vXG4gICAgLy8gSXQgdXNlcyBhIHByZXR0eSBuYWl2ZSBhbGdvcml0aG0gdG8gZG8gc28sIGZvciBtb3JlIGNvbXBsaWNhdGVkIG9wdGlvbnMgc2VlIFt3aWtpcGVkaWFdKGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQm91bmRpbmdfc3BoZXJlKS5cbiAgICBfZmluZEJvdW5kczogZnVuY3Rpb24ocG9pbnRzKSB7XG4gICAgICAgIHZhciBtaW5YID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1pblk9SW5maW5pdHksIG1heFk9LUluZmluaXR5O1xuICAgICAgICB2YXIgcDtcblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIE1CUiBvZiB0aGUgcG9pbnRzIGJ5IGZpbmRpbmcgdGhlIG1pbi9tYXggeCBhbmQgeVxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8cG9pbnRzLmxlbmd0aDsgKytpKXtcbiAgICAgICAgICAgIHAgPSBwb2ludHNbaV07XG4gICAgICAgICAgICBpZiAocFswXSA8IG1pblgpXG4gICAgICAgICAgICAgICAgbWluWCA9IHBbMF07XG4gICAgICAgICAgICBpZiAocFswXSA+IG1heFgpXG4gICAgICAgICAgICAgICAgbWF4WCA9IHBbMF07XG4gICAgICAgICAgICBpZiAocFsxXSA8IG1pblkpXG4gICAgICAgICAgICAgICAgbWluWSA9IHBbMV07XG4gICAgICAgICAgICBpZiAocFsxXSA+IG1heFkpXG4gICAgICAgICAgICAgICAgbWF4WSA9IHBbMV07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGlzIGRlc2NyaWJlcyBhIGNpcmNsZSBjZW50ZXJlZCBvbiB0aGUgTUJSIG9mIHRoZSBwb2ludHMsIHdpdGggYSBkaWFtZXRlciBlcXVhbCB0byBpdHMgZGlhZ29uYWxcbiAgICAgICAgLy8gSXQgd2lsbCBiZSB1c2VkIHRvIGZpbmQgYSByb3VnaCBib3VuZGluZyBib3ggcm91bmQgdGhlIHBvaW50cywgZXZlbiBpZiB0aGV5J3ZlIGJlZW4gcm90YXRlZFxuICAgICAgICB2YXIgY2JyID0ge1xuICAgICAgICAgICAgICAgIGN4OiAobWluWCArIG1heFgpIC8gMixcbiAgICAgICAgICAgICAgICBjeTogKG1pblkgKyBtYXhZKSAvIDIsXG4gICAgICAgICAgICAgICAgcjogTWF0aC5zcXJ0KCAobWF4WCAtIG1pblgpKihtYXhYIC0gbWluWCkgKyAobWF4WSAtIG1pblkpKihtYXhZIC0gbWluWSkpLzIsXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gV2UgbmVlZCB0byB3b3JyeSBhYm91dCByZXNpemluZywgYnV0IG9ubHkgaWYgcmVzaXppbmcgY291bGQgcG9zc2libHkgY2hhbmdlIHdoZXRoZXIgdGhlIGhpdGJveCBpcyBpbiBvciBvdXQgb2YgYm91bmRzXG4gICAgICAgIC8vIFRodXMgaWYgdGhlIHVwcGVyLWxlZnQgY29ybmVyIGlzIG91dCBvZiBib3VuZHMsIHRoZW4gdGhlcmUncyBubyBuZWVkIHRvIHJlY2hlY2sgb24gcmVzaXplXG4gICAgICAgIGlmIChtaW5YID49IDAgJiYgbWluWSA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLl9jaGVja0JvdW5kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9jYnIgPT09IG51bGwgJiYgdGhpcy5fdyA8IG1heFggfHwgdGhpcy5faCA8IG1heFkgKXtcbiAgICAgICAgICAgICAgICAgICB0aGlzLl9jYnIgPSBjYnI7XG4gICAgICAgICAgICAgICAgICAgdGhpcy5fY2FsY3VsYXRlTUJSKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jYnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2JyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2FsY3VsYXRlTUJSKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuYmluZChcIlJlc2l6ZVwiLCB0aGlzLl9jaGVja0JvdW5kcyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIElmIHRoZSBoaXRib3ggaXMgd2l0aGluIHRoZSBlbnRpdHksIF9jYnIgaXMgbnVsbFxuICAgICAgICAvLyBPdGhlcndpc2UsIHNldCBpdCwgYW5kIGltbWVkaWF0ZWx5IGNhbGN1bGF0ZSB0aGUgYm91bmRpbmcgYm94LlxuICAgICAgICBpZiAobWluWCA+PSAwICYmIG1pblkgPj0gMCAmJiBtYXhYIDw9IHRoaXMuX3cgJiYgbWF4WSA8PSB0aGlzLl9oKXtcbiAgICAgICAgICAgIHRoaXMuX2NiciA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9jYnIgPSBjYnI7XG4gICAgICAgICAgICB0aGlzLl9jYWxjdWxhdGVNQlIoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgIH0sXG5cbiAgICAvLyBUaGUgZGVmYXVsdCBiZWhhdmlvciBpcyB0byBtYXRjaCB0aGUgaGl0Ym94IHRvIHRoZSBlbnRpdHkuICBcbiAgICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgY2hhbmdlIHRoZSBoaXRib3ggd2hlbiBhIFwiUmVzaXplXCIgZXZlbnQgdHJpZ2dlcnMuIFxuICAgIF9yZXNpemVNYXA6IGZ1bmN0aW9uIChlKSB7XG5cbiAgICAgICAgdmFyIGR4LCBkeSwgcm90ID0gdGhpcy5yb3RhdGlvbiAqIERFR19UT19SQUQsXG4gICAgICAgICAgICBwb2ludHMgPSB0aGlzLm1hcC5wb2ludHM7XG5cbiAgICAgICAgLy8gRGVwZW5kaW5nIG9uIHRoZSBjaGFuZ2Ugb2YgYXhpcywgbW92ZSB0aGUgY29ybmVycyBvZiB0aGUgcmVjdGFuZ2xlIGFwcHJvcHJpYXRlbHlcbiAgICAgICAgaWYgKGUuYXhpcyA9PT0gJ3cnKSB7XG5cbiAgICAgICAgICAgIGlmIChyb3QpIHtcbiAgICAgICAgICAgICAgICBkeCA9IGUuYW1vdW50ICogTWF0aC5jb3Mocm90KTtcbiAgICAgICAgICAgICAgICBkeSA9IGUuYW1vdW50ICogTWF0aC5zaW4ocm90KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZHggPSBlLmFtb3VudDtcbiAgICAgICAgICAgICAgICBkeSA9IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFwidG9wIHJpZ2h0XCIgcG9pbnQgc2hpZnRzIG9uIGNoYW5nZSBvZiB3XG4gICAgICAgICAgICBwb2ludHNbMV1bMF0gKz0gZHg7XG4gICAgICAgICAgICBwb2ludHNbMV1bMV0gKz0gZHk7XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIGlmIChyb3QpIHtcbiAgICAgICAgICAgICAgICBkeSA9IGUuYW1vdW50ICogTWF0aC5jb3Mocm90KTtcbiAgICAgICAgICAgICAgICBkeCA9IC1lLmFtb3VudCAqIE1hdGguc2luKHJvdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGR4ID0gMDtcbiAgICAgICAgICAgICAgICBkeSA9IGUuYW1vdW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBcImJvdHRvbSBsZWZ0XCIgcG9pbnQgc2hpZnRzIG9uIGNoYW5nZSBvZiBoXG4gICAgICAgICAgICBwb2ludHNbM11bMF0gKz0gZHg7XG4gICAgICAgICAgICBwb2ludHNbM11bMV0gKz0gZHk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBcImJvdHRvbSByaWdodFwiIHBvaW50IHNoaWZ0cyBvbiBlaXRoZXIgY2hhbmdlXG4gICAgICAgIHBvaW50c1syXVswXSArPSBkeDtcbiAgICAgICAgcG9pbnRzWzJdWzFdICs9IGR5O1xuXG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmhpdFxuICAgICAqIEBjb21wIENvbGxpc2lvblxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuL0FycmF5IGhpdChTdHJpbmcgY29tcG9uZW50KVxuICAgICAqIEBwYXJhbSBjb21wb25lbnQgLSBDaGVjayBjb2xsaXNpb24gd2l0aCBlbnRpdGllcyB0aGF0IGhhcyB0aGlzIGNvbXBvbmVudFxuICAgICAqIEByZXR1cm4gYGZhbHNlYCBpZiBubyBjb2xsaXNpb24uIElmIGEgY29sbGlzaW9uIGlzIGRldGVjdGVkLCByZXR1cm5zIGFuIEFycmF5IG9mIG9iamVjdHMgdGhhdCBhcmUgY29sbGlkaW5nLlxuICAgICAqXG4gICAgICogVGFrZXMgYW4gYXJndW1lbnQgZm9yIGEgY29tcG9uZW50IHRvIHRlc3QgY29sbGlzaW9uIGZvci4gSWYgYSBjb2xsaXNpb24gaXMgZm91bmQsIGFuIGFycmF5IG9mXG4gICAgICogZXZlcnkgb2JqZWN0IGluIGNvbGxpc2lvbiBhbG9uZyB3aXRoIHRoZSBhbW91bnQgb2Ygb3ZlcmxhcCBpcyBwYXNzZWQuXG4gICAgICpcbiAgICAgKiBJZiBubyBjb2xsaXNpb24sIHdpbGwgcmV0dXJuIGZhbHNlLiBUaGUgcmV0dXJuIGNvbGxpc2lvbiBkYXRhIHdpbGwgYmUgYW4gQXJyYXkgb2YgT2JqZWN0cyB3aXRoIHRoZVxuICAgICAqIHR5cGUgb2YgY29sbGlzaW9uIHVzZWQsIHRoZSBvYmplY3QgY29sbGlkZWQgYW5kIGlmIHRoZSB0eXBlIHVzZWQgd2FzIFNBVCAoYSBwb2x5Z29uIHdhcyB1c2VkIGFzIHRoZSBoaXRib3gpIHRoZW4gYW4gYW1vdW50IG9mIG92ZXJsYXAuXFxcbiAgICAgKiB+fn5cbiAgICAgKiBbe1xuICAgICAqICAgIG9iajogW2VudGl0eV0sXG4gICAgICogICAgdHlwZTogXCJNQlJcIiBvciBcIlNBVFwiLFxuICAgICAqICAgIG92ZXJsYXA6IFtudW1iZXJdXG4gICAgICogfV1cbiAgICAgKiB+fn5cbiAgICAgKiBgTUJSYCBpcyB5b3VyIHN0YW5kYXJkIGF4aXMgYWxpZ25lZCByZWN0YW5nbGUgaW50ZXJzZWN0aW9uIChgLmludGVyc2VjdGAgaW4gdGhlIDJEIGNvbXBvbmVudCkuXG4gICAgICogYFNBVGAgaXMgY29sbGlzaW9uIGJldHdlZW4gYW55IGNvbnZleCBwb2x5Z29uLlxuICAgICAqXG4gICAgICogQHNlZSAub25IaXQsIDJEXG4gICAgICovXG4gICAgaGl0OiBmdW5jdGlvbiAoY29tcCkge1xuICAgICAgICB2YXIgYXJlYSA9IHRoaXMuX2NiciB8fCB0aGlzLl9tYnIgfHwgdGhpcyxcbiAgICAgICAgICAgIHJlc3VsdHMgPSBDcmFmdHkubWFwLnNlYXJjaChhcmVhLCBmYWxzZSksXG4gICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgIGwgPSByZXN1bHRzLmxlbmd0aCxcbiAgICAgICAgICAgIGR1cGVzID0ge30sXG4gICAgICAgICAgICBpZCwgb2JqLCBvYXJlYSwga2V5LFxuICAgICAgICAgICAgaGFzTWFwID0gKCdtYXAnIGluIHRoaXMgJiYgJ2NvbnRhaW5zUG9pbnQnIGluIHRoaXMubWFwKSxcbiAgICAgICAgICAgIGZpbmFscmVzdWx0ID0gW107XG5cbiAgICAgICAgaWYgKCFsKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgb2JqID0gcmVzdWx0c1tpXTtcbiAgICAgICAgICAgIG9hcmVhID0gb2JqLl9jYnIgfHwgb2JqLl9tYnIgfHwgb2JqOyAvL3VzZSB0aGUgbWJyXG5cbiAgICAgICAgICAgIGlmICghb2JqKSBjb250aW51ZTtcbiAgICAgICAgICAgIGlkID0gb2JqWzBdO1xuXG4gICAgICAgICAgICAvL2NoZWNrIGlmIG5vdCBhZGRlZCB0byBoYXNoIGFuZCB0aGF0IGFjdHVhbGx5IGludGVyc2VjdHNcbiAgICAgICAgICAgIGlmICghZHVwZXNbaWRdICYmIHRoaXNbMF0gIT09IGlkICYmIG9iai5fX2NbY29tcF0gJiZcbiAgICAgICAgICAgICAgICBvYXJlYS5feCA8IGFyZWEuX3ggKyBhcmVhLl93ICYmIG9hcmVhLl94ICsgb2FyZWEuX3cgPiBhcmVhLl94ICYmXG4gICAgICAgICAgICAgICAgb2FyZWEuX3kgPCBhcmVhLl95ICsgYXJlYS5faCAmJiBvYXJlYS5faCArIG9hcmVhLl95ID4gYXJlYS5feSlcbiAgICAgICAgICAgICAgICBkdXBlc1tpZF0gPSBvYmo7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGtleSBpbiBkdXBlcykge1xuICAgICAgICAgICAgb2JqID0gZHVwZXNba2V5XTtcblxuICAgICAgICAgICAgaWYgKGhhc01hcCAmJiAnbWFwJyBpbiBvYmopIHtcbiAgICAgICAgICAgICAgICB2YXIgU0FUID0gdGhpcy5fU0FUKHRoaXMubWFwLCBvYmoubWFwKTtcbiAgICAgICAgICAgICAgICBTQVQub2JqID0gb2JqO1xuICAgICAgICAgICAgICAgIFNBVC50eXBlID0gXCJTQVRcIjtcbiAgICAgICAgICAgICAgICBpZiAoU0FUKSBmaW5hbHJlc3VsdC5wdXNoKFNBVCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZpbmFscmVzdWx0LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBvYmo6IG9iaixcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJNQlJcIlxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmaW5hbHJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmaW5hbHJlc3VsdDtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMub25IaXRcbiAgICAgKiBAY29tcCBDb2xsaXNpb25cbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAub25IaXQoU3RyaW5nIGNvbXBvbmVudCwgRnVuY3Rpb24gaGl0WywgRnVuY3Rpb24gbm9IaXRdKVxuICAgICAqIEBwYXJhbSBjb21wb25lbnQgLSBDb21wb25lbnQgdG8gY2hlY2sgY29sbGlzaW9ucyBmb3JcbiAgICAgKiBAcGFyYW0gaGl0IC0gQ2FsbGJhY2sgbWV0aG9kIHRvIGV4ZWN1dGUgdXBvbiBjb2xsaXNpb24gd2l0aCBjb21wb25lbnQuICBXaWxsIGJlIHBhc3NlZCB0aGUgcmVzdWx0cyBvZiB0aGUgY29sbGlzaW9uIGNoZWNrIGluIHRoZSBzYW1lIGZvcm1hdCBkb2N1bWVudGVkIGZvciBoaXQoKS5cbiAgICAgKiBAcGFyYW0gbm9IaXQgLSBDYWxsYmFjayBtZXRob2QgZXhlY3V0ZWQgb25jZSBhcyBzb29uIGFzIGNvbGxpc2lvbiBzdG9wc1xuICAgICAqXG4gICAgICogQ3JlYXRlcyBhbiBFbnRlckZyYW1lIGV2ZW50IGNhbGxpbmcgLmhpdCgpIGVhY2ggZnJhbWUuICBXaGVuIGEgY29sbGlzaW9uIGlzIGRldGVjdGVkIHRoZSBjYWxsYmFjayB3aWxsIGJlIGludm9rZWQuXG4gICAgICpcbiAgICAgKiBAc2VlIC5oaXRcbiAgICAgKi9cbiAgICBvbkhpdDogZnVuY3Rpb24gKGNvbXAsIGNhbGxiYWNrLCBjYWxsYmFja09mZikge1xuICAgICAgICB2YXIganVzdEhpdCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmJpbmQoXCJFbnRlckZyYW1lXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBoaXRkYXRhID0gdGhpcy5oaXQoY29tcCk7XG4gICAgICAgICAgICBpZiAoaGl0ZGF0YSkge1xuICAgICAgICAgICAgICAgIGp1c3RIaXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgaGl0ZGF0YSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGp1c3RIaXQpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrT2ZmID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tPZmYuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAganVzdEhpdCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIF9TQVQ6IGZ1bmN0aW9uIChwb2x5MSwgcG9seTIpIHtcbiAgICAgICAgdmFyIHBvaW50czEgPSBwb2x5MS5wb2ludHMsXG4gICAgICAgICAgICBwb2ludHMyID0gcG9seTIucG9pbnRzLFxuICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICBsID0gcG9pbnRzMS5sZW5ndGgsXG4gICAgICAgICAgICBqLCBrID0gcG9pbnRzMi5sZW5ndGgsXG4gICAgICAgICAgICBub3JtYWwgPSB7XG4gICAgICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgICAgICB5OiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgbWluMSwgbWluMixcbiAgICAgICAgICAgIG1heDEsIG1heDIsXG4gICAgICAgICAgICBpbnRlcnZhbCxcbiAgICAgICAgICAgIE1UViA9IG51bGwsXG4gICAgICAgICAgICBNVFYyID0gbnVsbCxcbiAgICAgICAgICAgIE1OID0gbnVsbCxcbiAgICAgICAgICAgIGRvdCxcbiAgICAgICAgICAgIG5leHRQb2ludCxcbiAgICAgICAgICAgIGN1cnJlbnRQb2ludDtcblxuICAgICAgICAvL2xvb3AgdGhyb3VnaCB0aGUgZWRnZXMgb2YgUG9seWdvbiAxXG4gICAgICAgIGZvciAoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBuZXh0UG9pbnQgPSBwb2ludHMxWyhpID09IGwgLSAxID8gMCA6IGkgKyAxKV07XG4gICAgICAgICAgICBjdXJyZW50UG9pbnQgPSBwb2ludHMxW2ldO1xuXG4gICAgICAgICAgICAvL2dlbmVyYXRlIHRoZSBub3JtYWwgZm9yIHRoZSBjdXJyZW50IGVkZ2VcbiAgICAgICAgICAgIG5vcm1hbC54ID0gLShuZXh0UG9pbnRbMV0gLSBjdXJyZW50UG9pbnRbMV0pO1xuICAgICAgICAgICAgbm9ybWFsLnkgPSAobmV4dFBvaW50WzBdIC0gY3VycmVudFBvaW50WzBdKTtcblxuICAgICAgICAgICAgLy9ub3JtYWxpemUgdGhlIHZlY3RvclxuICAgICAgICAgICAgbGVuZ3RoID0gTWF0aC5zcXJ0KG5vcm1hbC54ICogbm9ybWFsLnggKyBub3JtYWwueSAqIG5vcm1hbC55KTtcbiAgICAgICAgICAgIG5vcm1hbC54IC89IGxlbmd0aDtcbiAgICAgICAgICAgIG5vcm1hbC55IC89IGxlbmd0aDtcblxuICAgICAgICAgICAgLy9kZWZhdWx0IG1pbiBtYXhcbiAgICAgICAgICAgIG1pbjEgPSBtaW4yID0gLTE7XG4gICAgICAgICAgICBtYXgxID0gbWF4MiA9IC0xO1xuXG4gICAgICAgICAgICAvL3Byb2plY3QgYWxsIHZlcnRpY2VzIGZyb20gcG9seTEgb250byBheGlzXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgbDsgKytqKSB7XG4gICAgICAgICAgICAgICAgZG90ID0gcG9pbnRzMVtqXVswXSAqIG5vcm1hbC54ICsgcG9pbnRzMVtqXVsxXSAqIG5vcm1hbC55O1xuICAgICAgICAgICAgICAgIGlmIChkb3QgPiBtYXgxIHx8IG1heDEgPT09IC0xKSBtYXgxID0gZG90O1xuICAgICAgICAgICAgICAgIGlmIChkb3QgPCBtaW4xIHx8IG1pbjEgPT09IC0xKSBtaW4xID0gZG90O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3Byb2plY3QgYWxsIHZlcnRpY2VzIGZyb20gcG9seTIgb250byBheGlzXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgazsgKytqKSB7XG4gICAgICAgICAgICAgICAgZG90ID0gcG9pbnRzMltqXVswXSAqIG5vcm1hbC54ICsgcG9pbnRzMltqXVsxXSAqIG5vcm1hbC55O1xuICAgICAgICAgICAgICAgIGlmIChkb3QgPiBtYXgyIHx8IG1heDIgPT09IC0xKSBtYXgyID0gZG90O1xuICAgICAgICAgICAgICAgIGlmIChkb3QgPCBtaW4yIHx8IG1pbjIgPT09IC0xKSBtaW4yID0gZG90O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2NhbGN1bGF0ZSB0aGUgbWluaW11bSB0cmFuc2xhdGlvbiB2ZWN0b3Igc2hvdWxkIGJlIG5lZ2F0aXZlXG4gICAgICAgICAgICBpZiAobWluMSA8IG1pbjIpIHtcbiAgICAgICAgICAgICAgICBpbnRlcnZhbCA9IG1pbjIgLSBtYXgxO1xuXG4gICAgICAgICAgICAgICAgbm9ybWFsLnggPSAtbm9ybWFsLng7XG4gICAgICAgICAgICAgICAgbm9ybWFsLnkgPSAtbm9ybWFsLnk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGludGVydmFsID0gbWluMSAtIG1heDI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vZXhpdCBlYXJseSBpZiBwb3NpdGl2ZVxuICAgICAgICAgICAgaWYgKGludGVydmFsID49IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChNVFYgPT09IG51bGwgfHwgaW50ZXJ2YWwgPiBNVFYpIHtcbiAgICAgICAgICAgICAgICBNVFYgPSBpbnRlcnZhbDtcbiAgICAgICAgICAgICAgICBNTiA9IHtcbiAgICAgICAgICAgICAgICAgICAgeDogbm9ybWFsLngsXG4gICAgICAgICAgICAgICAgICAgIHk6IG5vcm1hbC55XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vbG9vcCB0aHJvdWdoIHRoZSBlZGdlcyBvZiBQb2x5Z29uIDJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGs7IGkrKykge1xuICAgICAgICAgICAgbmV4dFBvaW50ID0gcG9pbnRzMlsoaSA9PSBrIC0gMSA/IDAgOiBpICsgMSldO1xuICAgICAgICAgICAgY3VycmVudFBvaW50ID0gcG9pbnRzMltpXTtcblxuICAgICAgICAgICAgLy9nZW5lcmF0ZSB0aGUgbm9ybWFsIGZvciB0aGUgY3VycmVudCBlZGdlXG4gICAgICAgICAgICBub3JtYWwueCA9IC0obmV4dFBvaW50WzFdIC0gY3VycmVudFBvaW50WzFdKTtcbiAgICAgICAgICAgIG5vcm1hbC55ID0gKG5leHRQb2ludFswXSAtIGN1cnJlbnRQb2ludFswXSk7XG5cbiAgICAgICAgICAgIC8vbm9ybWFsaXplIHRoZSB2ZWN0b3JcbiAgICAgICAgICAgIGxlbmd0aCA9IE1hdGguc3FydChub3JtYWwueCAqIG5vcm1hbC54ICsgbm9ybWFsLnkgKiBub3JtYWwueSk7XG4gICAgICAgICAgICBub3JtYWwueCAvPSBsZW5ndGg7XG4gICAgICAgICAgICBub3JtYWwueSAvPSBsZW5ndGg7XG5cbiAgICAgICAgICAgIC8vZGVmYXVsdCBtaW4gbWF4XG4gICAgICAgICAgICBtaW4xID0gbWluMiA9IC0xO1xuICAgICAgICAgICAgbWF4MSA9IG1heDIgPSAtMTtcblxuICAgICAgICAgICAgLy9wcm9qZWN0IGFsbCB2ZXJ0aWNlcyBmcm9tIHBvbHkxIG9udG8gYXhpc1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGw7ICsraikge1xuICAgICAgICAgICAgICAgIGRvdCA9IHBvaW50czFbal1bMF0gKiBub3JtYWwueCArIHBvaW50czFbal1bMV0gKiBub3JtYWwueTtcbiAgICAgICAgICAgICAgICBpZiAoZG90ID4gbWF4MSB8fCBtYXgxID09PSAtMSkgbWF4MSA9IGRvdDtcbiAgICAgICAgICAgICAgICBpZiAoZG90IDwgbWluMSB8fCBtaW4xID09PSAtMSkgbWluMSA9IGRvdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9wcm9qZWN0IGFsbCB2ZXJ0aWNlcyBmcm9tIHBvbHkyIG9udG8gYXhpc1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGs7ICsraikge1xuICAgICAgICAgICAgICAgIGRvdCA9IHBvaW50czJbal1bMF0gKiBub3JtYWwueCArIHBvaW50czJbal1bMV0gKiBub3JtYWwueTtcbiAgICAgICAgICAgICAgICBpZiAoZG90ID4gbWF4MiB8fCBtYXgyID09PSAtMSkgbWF4MiA9IGRvdDtcbiAgICAgICAgICAgICAgICBpZiAoZG90IDwgbWluMiB8fCBtaW4yID09PSAtMSkgbWluMiA9IGRvdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9jYWxjdWxhdGUgdGhlIG1pbmltdW0gdHJhbnNsYXRpb24gdmVjdG9yIHNob3VsZCBiZSBuZWdhdGl2ZVxuICAgICAgICAgICAgaWYgKG1pbjEgPCBtaW4yKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJ2YWwgPSBtaW4yIC0gbWF4MTtcblxuICAgICAgICAgICAgICAgIG5vcm1hbC54ID0gLW5vcm1hbC54O1xuICAgICAgICAgICAgICAgIG5vcm1hbC55ID0gLW5vcm1hbC55O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbnRlcnZhbCA9IG1pbjEgLSBtYXgyO1xuXG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9leGl0IGVhcmx5IGlmIHBvc2l0aXZlXG4gICAgICAgICAgICBpZiAoaW50ZXJ2YWwgPj0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKE1UViA9PT0gbnVsbCB8fCBpbnRlcnZhbCA+IE1UVikgTVRWID0gaW50ZXJ2YWw7XG4gICAgICAgICAgICBpZiAoaW50ZXJ2YWwgPiBNVFYyIHx8IE1UVjIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBNVFYyID0gaW50ZXJ2YWw7XG4gICAgICAgICAgICAgICAgTU4gPSB7XG4gICAgICAgICAgICAgICAgICAgIHg6IG5vcm1hbC54LFxuICAgICAgICAgICAgICAgICAgICB5OiBub3JtYWwueVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgb3ZlcmxhcDogTVRWMixcbiAgICAgICAgICAgIG5vcm1hbDogTU5cbiAgICAgICAgfTtcbiAgICB9XG59KTtcbiIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgb3ZlcjogbnVsbCwgLy9vYmplY3QgbW91c2VvdmVyLCB3YWl0aW5nIGZvciBvdXRcbiAgICBtb3VzZU9ianM6IDAsXG4gICAgbW91c2VQb3M6IHt9LFxuICAgIGxhc3RFdmVudDogbnVsbCxcbiAgICBrZXlkb3duOiB7fSxcbiAgICBzZWxlY3RlZDogZmFsc2UsXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5rZXlkb3duXG4gICAgICogQGNhdGVnb3J5IElucHV0XG4gICAgICogUmVtZW1iZXJpbmcgd2hhdCBrZXlzIChyZWZlcnJlZCBieSBVbmljb2RlKSBhcmUgZG93bi5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmMoXCJLZXlib2FyZFwiLCB7XG4gICAgICogICBpc0Rvd246IGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgKiAgICAgaWYgKHR5cGVvZiBrZXkgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgKiAgICAgICBrZXkgPSBDcmFmdHkua2V5c1trZXldO1xuICAgICAqICAgICB9XG4gICAgICogICAgIHJldHVybiAhIUNyYWZ0eS5rZXlkb3duW2tleV07XG4gICAgICogICB9XG4gICAgICogfSk7XG4gICAgICogfn5+XG4gICAgICogQHNlZSBLZXlib2FyZCwgQ3JhZnR5LmtleXNcbiAgICAgKi9cblxuICAgIGRldGVjdEJsdXI6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIHZhciBzZWxlY3RlZCA9ICgoZS5jbGllbnRYID4gQ3JhZnR5LnN0YWdlLnggJiYgZS5jbGllbnRYIDwgQ3JhZnR5LnN0YWdlLnggKyBDcmFmdHkudmlld3BvcnQud2lkdGgpICYmXG4gICAgICAgICAgICAoZS5jbGllbnRZID4gQ3JhZnR5LnN0YWdlLnkgJiYgZS5jbGllbnRZIDwgQ3JhZnR5LnN0YWdlLnkgKyBDcmFmdHkudmlld3BvcnQuaGVpZ2h0KSk7XG5cbiAgICAgICAgaWYgKCFDcmFmdHkuc2VsZWN0ZWQgJiYgc2VsZWN0ZWQpXG4gICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIkNyYWZ0eUZvY3VzXCIpO1xuICAgICAgICBpZiAoQ3JhZnR5LnNlbGVjdGVkICYmICFzZWxlY3RlZClcbiAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiQ3JhZnR5Qmx1clwiKTtcblxuICAgICAgICBDcmFmdHkuc2VsZWN0ZWQgPSBzZWxlY3RlZDtcbiAgICB9LFxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1vdXNlRGlzcGF0Y2hcbiAgICAgKiBAY2F0ZWdvcnkgSW5wdXRcbiAgICAgKlxuICAgICAqIEludGVybmFsIG1ldGhvZCB3aGljaCBkaXNwYXRjaGVzIG1vdXNlIGV2ZW50cyByZWNlaXZlZCBieSBDcmFmdHkgKGNyYWZ0eS5zdGFnZS5lbGVtKS5cbiAgICAgKiBUaGUgbW91c2UgZXZlbnRzIGdldCBkaXNwYXRjaGVkIHRvIHRoZSBjbG9zZXN0IGVudGl0eSB0byB0aGUgc291cmNlIG9mIHRoZSBldmVudCAoaWYgYXZhaWxhYmxlKS5cbiAgICAgKlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gc2V0cyBhIGdsb2JhbCBwcm9wZXJ0eSBDcmFmdHkubGFzdEV2ZW50LCB3aGljaCBob2xkcyB0aGUgbW9zdCByZWNlbnQgZXZlbnQgdGhhdFxuICAgICAqIG9jY3VyZWQgKHVzZWZ1bCBmb3IgZGV0ZXJtaW5pbmcgbW91c2UgcG9zaXRpb24gaW4gZXZlcnkgZnJhbWUpLlxuICAgICAqIH5+flxuICAgICAqIHZhciBuZXdlc3RYID0gQ3JhZnR5Lmxhc3RFdmVudC5yZWFsWCxcbiAgICAgKiAgICAgbmV3ZXN0WSA9IENyYWZ0eS5sYXN0RXZlbnQucmVhbFk7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBOb3RhYmxlIHByb3BlcnRpZXMgb2YgYSBNb3VzZUV2ZW50IGU6XG4gICAgICogfn5+XG4gICAgICogLy8oeCx5KSBjb29yZGluYXRlcyBvZiBtb3VzZSBldmVudCBpbiB3ZWIgYnJvd3NlciBzY3JlZW4gc3BhY2VcbiAgICAgKiBlLmNsaWVudFgsIGUuY2xpZW50WVx0XG4gICAgICogLy8oeCx5KSBjb29yZGluYXRlcyBvZiBtb3VzZSBldmVudCBpbiB3b3JsZC92aWV3cG9ydCBzcGFjZVxuICAgICAqIGUucmVhbFgsIGUucmVhbFlcdFx0XG4gICAgICogLy8gTm9ybWFsaXplZCBtb3VzZSBidXR0b24gYWNjb3JkaW5nIHRvIENyYWZ0eS5tb3VzZUJ1dHRvbnNcbiAgICAgKiBlLm1vdXNlQnV0dG9uXHRcdFx0XG4gICAgICogfn5+XG4gICAgICogQHNlZSBDcmFmdHkudG91Y2hEaXNwYXRjaFxuICAgICAqL1xuICAgIG1vdXNlRGlzcGF0Y2g6IGZ1bmN0aW9uIChlKSB7XG5cbiAgICAgICAgaWYgKCFDcmFmdHkubW91c2VPYmpzKSByZXR1cm47XG4gICAgICAgIENyYWZ0eS5sYXN0RXZlbnQgPSBlO1xuXG4gICAgICAgIHZhciBtYXh6ID0gLTEsXG4gICAgICAgICAgICBjbG9zZXN0LFxuICAgICAgICAgICAgcSxcbiAgICAgICAgICAgIGkgPSAwLFxuICAgICAgICAgICAgbCxcbiAgICAgICAgICAgIHBvcyA9IENyYWZ0eS5ET00udHJhbnNsYXRlKGUuY2xpZW50WCwgZS5jbGllbnRZKSxcbiAgICAgICAgICAgIHgsIHksXG4gICAgICAgICAgICBkdXBlcyA9IHt9LFxuICAgICAgICAgICAgdGFyID0gZS50YXJnZXQgPyBlLnRhcmdldCA6IGUuc3JjRWxlbWVudCxcbiAgICAgICAgICAgIHR5cGUgPSBlLnR5cGU7XG5cbiAgICAgICAgLy9Ob3JtYWxpemUgYnV0dG9uIGFjY29yZGluZyB0byBodHRwOi8vdW5peHBhcGEuY29tL2pzL21vdXNlLmh0bWxcbiAgICAgICAgaWYgKHR5cGVvZiBlLndoaWNoID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgZS5tb3VzZUJ1dHRvbiA9IChlLmJ1dHRvbiA8IDIpID8gQ3JhZnR5Lm1vdXNlQnV0dG9ucy5MRUZUIDogKChlLmJ1dHRvbiA9PSA0KSA/IENyYWZ0eS5tb3VzZUJ1dHRvbnMuTUlERExFIDogQ3JhZnR5Lm1vdXNlQnV0dG9ucy5SSUdIVCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlLm1vdXNlQnV0dG9uID0gKGUud2hpY2ggPCAyKSA/IENyYWZ0eS5tb3VzZUJ1dHRvbnMuTEVGVCA6ICgoZS53aGljaCA9PSAyKSA/IENyYWZ0eS5tb3VzZUJ1dHRvbnMuTUlERExFIDogQ3JhZnR5Lm1vdXNlQnV0dG9ucy5SSUdIVCk7XG4gICAgICAgIH1cblxuICAgICAgICBlLnJlYWxYID0geCA9IENyYWZ0eS5tb3VzZVBvcy54ID0gcG9zLng7XG4gICAgICAgIGUucmVhbFkgPSB5ID0gQ3JhZnR5Lm1vdXNlUG9zLnkgPSBwb3MueTtcblxuICAgICAgICAvL2lmIGl0J3MgYSBET00gZWxlbWVudCB3aXRoIE1vdXNlIGNvbXBvbmVudCB3ZSBhcmUgZG9uZVxuICAgICAgICBpZiAodGFyLm5vZGVOYW1lICE9IFwiQ0FOVkFTXCIpIHtcbiAgICAgICAgICAgIHdoaWxlICh0eXBlb2YgKHRhci5pZCkgIT0gJ3N0cmluZycgJiYgdGFyLmlkLmluZGV4T2YoJ2VudCcpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGFyID0gdGFyLnBhcmVudE5vZGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbnQgPSBDcmFmdHkocGFyc2VJbnQodGFyLmlkLnJlcGxhY2UoJ2VudCcsICcnKSwgMTApKTtcbiAgICAgICAgICAgIGlmIChlbnQuaGFzKCdNb3VzZScpICYmIGVudC5pc0F0KHgsIHkpKVxuICAgICAgICAgICAgICAgIGNsb3Nlc3QgPSBlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLy9lbHNlIHdlIHNlYXJjaCBmb3IgYW4gZW50aXR5IHdpdGggTW91c2UgY29tcG9uZW50XG4gICAgICAgIGlmICghY2xvc2VzdCkge1xuICAgICAgICAgICAgcSA9IENyYWZ0eS5tYXAuc2VhcmNoKHtcbiAgICAgICAgICAgICAgICBfeDogeCxcbiAgICAgICAgICAgICAgICBfeTogeSxcbiAgICAgICAgICAgICAgICBfdzogMSxcbiAgICAgICAgICAgICAgICBfaDogMVxuICAgICAgICAgICAgfSwgZmFsc2UpO1xuXG4gICAgICAgICAgICBmb3IgKGwgPSBxLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgICAgICAgICAgICAgIGlmICghcVtpXS5fX2MuTW91c2UgfHwgIXFbaV0uX3Zpc2libGUpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBxW2ldLFxuICAgICAgICAgICAgICAgICAgICBmbGFnID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAvL3dlZWQgb3V0IGR1cGxpY2F0ZXNcbiAgICAgICAgICAgICAgICBpZiAoZHVwZXNbY3VycmVudFswXV0pIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGVsc2UgZHVwZXNbY3VycmVudFswXV0gPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQubWFwQXJlYSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5tYXBBcmVhLmNvbnRhaW5zUG9pbnQoeCwgeSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZsYWcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50LmlzQXQoeCwgeSkpIGZsYWcgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKGZsYWcgJiYgKGN1cnJlbnQuX3ogPj0gbWF4eiB8fCBtYXh6ID09PSAtMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9pZiB0aGUgWiBpcyB0aGUgc2FtZSwgc2VsZWN0IHRoZSBjbG9zZXN0IEdVSURcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQuX3ogPT09IG1heHogJiYgY3VycmVudFswXSA8IGNsb3Nlc3RbMF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG1heHogPSBjdXJyZW50Ll96O1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0ID0gY3VycmVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL2ZvdW5kIGNsb3Nlc3Qgb2JqZWN0IHRvIG1vdXNlXG4gICAgICAgIGlmIChjbG9zZXN0KSB7XG4gICAgICAgICAgICAvL2NsaWNrIG11c3QgbW91c2Vkb3duIGFuZCBvdXQgb24gdGlsZVxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwibW91c2Vkb3duXCIpIHtcbiAgICAgICAgICAgICAgICBjbG9zZXN0LnRyaWdnZXIoXCJNb3VzZURvd25cIiwgZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFwibW91c2V1cFwiKSB7XG4gICAgICAgICAgICAgICAgY2xvc2VzdC50cmlnZ2VyKFwiTW91c2VVcFwiLCBlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PSBcImRibGNsaWNrXCIpIHtcbiAgICAgICAgICAgICAgICBjbG9zZXN0LnRyaWdnZXIoXCJEb3VibGVDbGlja1wiLCBlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PSBcImNsaWNrXCIpIHtcbiAgICAgICAgICAgICAgICBjbG9zZXN0LnRyaWdnZXIoXCJDbGlja1wiLCBlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJtb3VzZW1vdmVcIikge1xuICAgICAgICAgICAgICAgIGNsb3Nlc3QudHJpZ2dlcihcIk1vdXNlTW92ZVwiLCBlKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vdmVyICE9PSBjbG9zZXN0KSB7IC8vaWYgbmV3IG1vdXNlbW92ZSwgaXQgaXMgb3ZlclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5vdmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm92ZXIudHJpZ2dlcihcIk1vdXNlT3V0XCIsIGUpOyAvL2lmIG92ZXIgd2Fzbid0IG51bGwsIHNlbmQgbW91c2VvdXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub3ZlciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdmVyID0gY2xvc2VzdDtcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC50cmlnZ2VyKFwiTW91c2VPdmVyXCIsIGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBjbG9zZXN0LnRyaWdnZXIodHlwZSwgZSk7IC8vdHJpZ2dlciB3aGF0ZXZlciBpdCBpc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwibW91c2Vtb3ZlXCIgJiYgdGhpcy5vdmVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vdmVyLnRyaWdnZXIoXCJNb3VzZU91dFwiLCBlKTtcbiAgICAgICAgICAgICAgICB0aGlzLm92ZXIgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwibW91c2Vkb3duXCIpIHtcbiAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQubW91c2Vsb29rKCdzdGFydCcsIGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBcIm1vdXNlbW92ZVwiKSB7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0Lm1vdXNlbG9vaygnZHJhZycsIGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09IFwibW91c2V1cFwiKSB7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0Lm1vdXNlbG9vaygnc3RvcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09IFwibW91c2Vtb3ZlXCIpIHtcbiAgICAgICAgICAgIHRoaXMubGFzdEV2ZW50ID0gZTtcbiAgICAgICAgfVxuXG4gICAgfSxcblxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkudG91Y2hEaXNwYXRjaFxuICAgICAqIEBjYXRlZ29yeSBJbnB1dFxuICAgICAqXG4gICAgICogVG91Y2hFdmVudHMgaGF2ZSBhIGRpZmZlcmVudCBzdHJ1Y3R1cmUgdGhlbiBNb3VzZUV2ZW50cy5cbiAgICAgKiBUaGUgcmVsZXZhbnQgZGF0YSBsaXZlcyBpbiBlLmNoYW5nZWRUb3VjaGVzWzBdLlxuICAgICAqIFRvIG5vcm1hbGl6ZSBUb3VjaEV2ZW50cyB3ZSBjYXRjaCB0aGVtIGFuZCBkaXNwYXRjaCBhIG1vY2sgTW91c2VFdmVudCBpbnN0ZWFkLlxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkubW91c2VEaXNwYXRjaFxuICAgICAqL1xuXG4gICAgdG91Y2hEaXNwYXRjaDogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgdmFyIHR5cGUsXG4gICAgICAgICAgICBsYXN0RXZlbnQgPSBDcmFmdHkubGFzdEV2ZW50O1xuXG4gICAgICAgIGlmIChlLnR5cGUgPT09IFwidG91Y2hzdGFydFwiKSB0eXBlID0gXCJtb3VzZWRvd25cIjtcbiAgICAgICAgZWxzZSBpZiAoZS50eXBlID09PSBcInRvdWNobW92ZVwiKSB0eXBlID0gXCJtb3VzZW1vdmVcIjtcbiAgICAgICAgZWxzZSBpZiAoZS50eXBlID09PSBcInRvdWNoZW5kXCIpIHR5cGUgPSBcIm1vdXNldXBcIjtcbiAgICAgICAgZWxzZSBpZiAoZS50eXBlID09PSBcInRvdWNoY2FuY2VsXCIpIHR5cGUgPSBcIm1vdXNldXBcIjtcbiAgICAgICAgZWxzZSBpZiAoZS50eXBlID09PSBcInRvdWNobGVhdmVcIikgdHlwZSA9IFwibW91c2V1cFwiO1xuXG4gICAgICAgIGlmIChlLnRvdWNoZXMgJiYgZS50b3VjaGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgZmlyc3QgPSBlLnRvdWNoZXNbMF07XG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGFuZ2VkVG91Y2hlcyAmJiBlLmNoYW5nZWRUb3VjaGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgZmlyc3QgPSBlLmNoYW5nZWRUb3VjaGVzWzBdO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdmFyIHNpbXVsYXRlZEV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoXCJNb3VzZUV2ZW50XCIpO1xuICAgICAgICAvLyBzaW11bGF0ZWRFdmVudC5pbml0TW91c2VFdmVudCh0eXBlLCB0cnVlLCB0cnVlLCB3aW5kb3csIDEsXG4gICAgICAgIC8vICAgICBmaXJzdC5zY3JlZW5YLFxuICAgICAgICAvLyAgICAgZmlyc3Quc2NyZWVuWSxcbiAgICAgICAgLy8gICAgIGZpcnN0LmNsaWVudFgsXG4gICAgICAgIC8vICAgICBmaXJzdC5jbGllbnRZLFxuICAgICAgICAvLyAgICAgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIDAsIGUucmVsYXRlZFRhcmdldFxuICAgICAgICAvLyApO1xuXG4gICAgICAgIC8vIGZpcnN0LnRhcmdldC5kaXNwYXRjaEV2ZW50KHNpbXVsYXRlZEV2ZW50KTtcblxuICAgICAgICAvLyAvLyB0cmlnZ2VyIGNsaWNrIHdoZW4gaXQgc2hvdWxkIGJlIHRyaWdnZXJlZFxuICAgICAgICAvLyBpZiAobGFzdEV2ZW50ICE9PSBudWxsICYmIGxhc3RFdmVudC50eXBlID09ICdtb3VzZWRvd24nICYmIHR5cGUgPT0gJ21vdXNldXAnKSB7XG4gICAgICAgIC8vICAgICB0eXBlID0gJ2NsaWNrJztcblxuICAgICAgICAvLyAgICAgc2ltdWxhdGVkRXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudChcIk1vdXNlRXZlbnRcIik7XG4gICAgICAgIC8vICAgICBzaW11bGF0ZWRFdmVudC5pbml0TW91c2VFdmVudCh0eXBlLCB0cnVlLCB0cnVlLCB3aW5kb3csIDEsXG4gICAgICAgIC8vICAgICAgICAgZmlyc3Quc2NyZWVuWCxcbiAgICAgICAgLy8gICAgICAgICBmaXJzdC5zY3JlZW5ZLFxuICAgICAgICAvLyAgICAgICAgIGZpcnN0LmNsaWVudFgsXG4gICAgICAgIC8vICAgICAgICAgZmlyc3QuY2xpZW50WSxcbiAgICAgICAgLy8gICAgICAgICBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgMCwgZS5yZWxhdGVkVGFyZ2V0XG4gICAgICAgIC8vICAgICApO1xuICAgICAgICAvLyAgICAgZmlyc3QudGFyZ2V0LmRpc3BhdGNoRXZlbnQoc2ltdWxhdGVkRXZlbnQpO1xuICAgICAgICAvLyB9XG5cbiAgICAgICAgLy9Eb24ndCBwcmV2ZW50IGRlZmF1bHQgYWN0aW9ucyBpZiB0YXJnZXQgbm9kZSBpcyBpbnB1dCBvciB0ZXh0YXJlYS5cbiAgICAgICAgaWYgKGUudGFyZ2V0ICYmIGUudGFyZ2V0Lm5vZGVOYW1lICE9PSAnSU5QVVQnICYmIGUudGFyZ2V0Lm5vZGVOYW1lICE9PSAnVEVYVEFSRUEnKSB7XG4gICAgICAgICAgICBpZiAoZS5wcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcblxuXG4gICAgLyoqQFxuICAgICAqICNLZXlib2FyZEV2ZW50XG4gICAgICogQGNhdGVnb3J5IElucHV0XG4gICAgICogS2V5Ym9hcmQgRXZlbnQgdHJpZ2dlcmVkIGJ5IENyYWZ0eSBDb3JlXG4gICAgICogQHRyaWdnZXIgS2V5RG93biAtIGlzIHRyaWdnZXJlZCBmb3IgZWFjaCBlbnRpdHkgd2hlbiB0aGUgRE9NICdrZXlkb3duJyBldmVudCBpcyB0cmlnZ2VyZWQuXG4gICAgICogQHRyaWdnZXIgS2V5VXAgLSBpcyB0cmlnZ2VyZWQgZm9yIGVhY2ggZW50aXR5IHdoZW4gdGhlIERPTSAna2V5dXAnIGV2ZW50IGlzIHRyaWdnZXJlZC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmUoXCIyRCwgRE9NLCBDb2xvclwiKVxuICAgICAqICAgLmF0dHIoe3g6IDEwMCwgeTogMTAwLCB3OiA1MCwgaDogNTB9KVxuICAgICAqICAgLmNvbG9yKFwicmVkXCIpXG4gICAgICogICAuYmluZCgnS2V5RG93bicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgKiAgICAgaWYoZS5rZXkgPT0gQ3JhZnR5LmtleXMuTEVGVF9BUlJPVykge1xuICAgICAqICAgICAgIHRoaXMueCA9IHRoaXMueC0xO1xuICAgICAqICAgICB9IGVsc2UgaWYgKGUua2V5ID09IENyYWZ0eS5rZXlzLlJJR0hUX0FSUk9XKSB7XG4gICAgICogICAgICAgdGhpcy54ID0gdGhpcy54KzE7XG4gICAgICogICAgIH0gZWxzZSBpZiAoZS5rZXkgPT0gQ3JhZnR5LmtleXMuVVBfQVJST1cpIHtcbiAgICAgKiAgICAgICB0aGlzLnkgPSB0aGlzLnktMTtcbiAgICAgKiAgICAgfSBlbHNlIGlmIChlLmtleSA9PSBDcmFmdHkua2V5cy5ET1dOX0FSUk9XKSB7XG4gICAgICogICAgICAgdGhpcy55ID0gdGhpcy55KzE7XG4gICAgICogICAgIH1cbiAgICAgKiAgIH0pO1xuICAgICAqIH5+flxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkua2V5c1xuICAgICAqL1xuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuZXZlbnRPYmplY3RcbiAgICAgKiBAY2F0ZWdvcnkgSW5wdXRcbiAgICAgKlxuICAgICAqIEV2ZW50IE9iamVjdCB1c2VkIGluIENyYWZ0eSBmb3IgY3Jvc3MgYnJvd3NlciBjb21wYXRpYmlsaXR5XG4gICAgICovXG5cbiAgICAvKipAXG4gICAgICogIy5rZXlcbiAgICAgKiBAY29tcCBDcmFmdHkuZXZlbnRPYmplY3RcbiAgICAgKlxuICAgICAqIFVuaWNvZGUgb2YgdGhlIGtleSBwcmVzc2VkXG4gICAgICovXG4gICAga2V5Ym9hcmREaXNwYXRjaDogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgLy8gVXNlIGEgQ3JhZnR5LXN0YW5kYXJkIGV2ZW50IG9iamVjdCB0byBhdm9pZCBjcm9zcy1icm93c2VyIGlzc3Vlc1xuICAgICAgICB2YXIgb3JpZ2luYWwgPSBlLFxuICAgICAgICAgICAgZXZudCA9IHt9LFxuICAgICAgICAgICAgcHJvcHMgPSBcImNoYXIgY2hhckNvZGUga2V5Q29kZSB0eXBlIHNoaWZ0S2V5IGN0cmxLZXkgbWV0YUtleSB0aW1lc3RhbXBcIi5zcGxpdChcIiBcIik7XG4gICAgICAgIGZvciAodmFyIGkgPSBwcm9wcy5sZW5ndGg7IGk7KSB7XG4gICAgICAgICAgICB2YXIgcHJvcCA9IHByb3BzWy0taV07XG4gICAgICAgICAgICBldm50W3Byb3BdID0gb3JpZ2luYWxbcHJvcF07XG4gICAgICAgIH1cbiAgICAgICAgZXZudC53aGljaCA9IG9yaWdpbmFsLmNoYXJDb2RlICE9PSBudWxsID8gb3JpZ2luYWwuY2hhckNvZGUgOiBvcmlnaW5hbC5rZXlDb2RlO1xuICAgICAgICBldm50LmtleSA9IG9yaWdpbmFsLmtleUNvZGUgfHwgb3JpZ2luYWwud2hpY2g7XG4gICAgICAgIGV2bnQub3JpZ2luYWxFdmVudCA9IG9yaWdpbmFsO1xuICAgICAgICBlID0gZXZudDtcblxuICAgICAgICBpZiAoZS50eXBlID09PSBcImtleWRvd25cIikge1xuICAgICAgICAgICAgaWYgKENyYWZ0eS5rZXlkb3duW2Uua2V5XSAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIENyYWZ0eS5rZXlkb3duW2Uua2V5XSA9IHRydWU7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJLZXlEb3duXCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gXCJrZXl1cFwiKSB7XG4gICAgICAgICAgICBkZWxldGUgQ3JhZnR5LmtleWRvd25bZS5rZXldO1xuICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJLZXlVcFwiLCBlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vcHJldmVudCBkZWZhdWx0IGFjdGlvbnMgZm9yIGFsbCBrZXlzIGV4Y2VwdCBiYWNrc3BhY2UgYW5kIEYxLUYxMiBhbmQgZXhjZXB0IGFjdGlvbnMgaW4gSU5QVVQgYW5kIFRFWFRBUkVBLlxuICAgICAgICAvL3ByZXZlbnQgYnViYmxpbmcgdXAgZm9yIGFsbCBrZXlzIGV4Y2VwdCBiYWNrc3BhY2UgYW5kIEYxLUYxMi5cbiAgICAgICAgLy9BbW9uZyBvdGhlcnMgdGhpcyBwcmV2ZW50IHRoZSBhcnJvdyBrZXlzIGZyb20gc2Nyb2xsaW5nIHRoZSBwYXJlbnQgcGFnZVxuICAgICAgICAvL29mIGFuIGlmcmFtZSBob3N0aW5nIHRoZSBnYW1lXG4gICAgICAgIGlmIChDcmFmdHkuc2VsZWN0ZWQgJiYgIShlLmtleSA9PSA4IHx8IGUua2V5ID49IDExMiAmJiBlLmtleSA8PSAxMzUpKSB7XG4gICAgICAgICAgICBpZiAoZS5zdG9wUHJvcGFnYXRpb24pIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBlbHNlIGUuY2FuY2VsQnViYmxlID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy9Eb24ndCBwcmV2ZW50IGRlZmF1bHQgYWN0aW9ucyBpZiB0YXJnZXQgbm9kZSBpcyBpbnB1dCBvciB0ZXh0YXJlYS5cbiAgICAgICAgICAgIGlmIChlLnRhcmdldCAmJiBlLnRhcmdldC5ub2RlTmFtZSAhPT0gJ0lOUFVUJyAmJiBlLnRhcmdldC5ub2RlTmFtZSAhPT0gJ1RFWFRBUkVBJykge1xuICAgICAgICAgICAgICAgIGlmIChlLnByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlLnJldHVyblZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vaW5pdGlhbGl6ZSB0aGUgaW5wdXQgZXZlbnRzIG9ubG9hZFxuQ3JhZnR5LmJpbmQoXCJMb2FkXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAvLyBDcmFmdHkuYWRkRXZlbnQodGhpcywgXCJrZXlkb3duXCIsIENyYWZ0eS5rZXlib2FyZERpc3BhdGNoKTtcbiAgICAvLyBDcmFmdHkuYWRkRXZlbnQodGhpcywgXCJrZXl1cFwiLCBDcmFmdHkua2V5Ym9hcmREaXNwYXRjaCk7XG5cbiAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2Vkb3duXCIsIENyYWZ0eS5tb3VzZURpc3BhdGNoKTtcbiAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2V1cFwiLCBDcmFmdHkubW91c2VEaXNwYXRjaCk7XG4gICAgLy8gQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIGRvY3VtZW50LmJvZHksIFwibW91c2V1cFwiLCBDcmFmdHkuZGV0ZWN0Qmx1cik7XG4gICAgQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcIm1vdXNlbW92ZVwiLCBDcmFmdHkubW91c2VEaXNwYXRjaCk7XG4gICAgQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcImNsaWNrXCIsIENyYWZ0eS5tb3VzZURpc3BhdGNoKTtcbiAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwiZGJsY2xpY2tcIiwgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2gpO1xuXG4gICAgLy8gQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcInRvdWNoc3RhcnRcIiwgQ3JhZnR5LnRvdWNoRGlzcGF0Y2gpO1xuICAgIENyYWZ0eS5hZGRFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaG1vdmVcIiwgQ3JhZnR5LnRvdWNoRGlzcGF0Y2gpO1xuICAgIC8vIENyYWZ0eS5hZGRFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaGVuZFwiLCBDcmFmdHkudG91Y2hEaXNwYXRjaCk7XG4gICAgQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcInRvdWNoY2FuY2VsXCIsIENyYWZ0eS50b3VjaERpc3BhdGNoKTtcbiAgICAvLyBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwidG91Y2hsZWF2ZVwiLCBDcmFmdHkudG91Y2hEaXNwYXRjaCk7XG59KTtcblxuQ3JhZnR5LmJpbmQoXCJDcmFmdHlTdG9wXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgXCJrZXlkb3duXCIsIENyYWZ0eS5rZXlib2FyZERpc3BhdGNoKTtcbiAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgXCJrZXl1cFwiLCBDcmFmdHkua2V5Ym9hcmREaXNwYXRjaCk7XG5cbiAgICBpZiAoQ3JhZnR5LnN0YWdlKSB7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJtb3VzZWRvd25cIiwgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2gpO1xuICAgICAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2V1cFwiLCBDcmFmdHkubW91c2VEaXNwYXRjaCk7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJtb3VzZW1vdmVcIiwgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2gpO1xuICAgICAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwiY2xpY2tcIiwgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2gpO1xuICAgICAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwiZGJsY2xpY2tcIiwgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2gpO1xuXG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaHN0YXJ0XCIsIENyYWZ0eS50b3VjaERpc3BhdGNoKTtcbiAgICAgICAgQ3JhZnR5LnJlbW92ZUV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcInRvdWNobW92ZVwiLCBDcmFmdHkudG91Y2hEaXNwYXRjaCk7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaGVuZFwiLCBDcmFmdHkudG91Y2hEaXNwYXRjaCk7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaGNhbmNlbFwiLCBDcmFmdHkudG91Y2hEaXNwYXRjaCk7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJ0b3VjaGxlYXZlXCIsIENyYWZ0eS50b3VjaERpc3BhdGNoKTtcbiAgICB9XG5cbiAgICAvLyBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgZG9jdW1lbnQuYm9keSwgXCJtb3VzZXVwXCIsIENyYWZ0eS5kZXRlY3RCbHVyKTtcbn0pO1xuXG4vKipAXG4gKiAjTW91c2VcbiAqIEBjYXRlZ29yeSBJbnB1dFxuICogUHJvdmlkZXMgdGhlIGVudGl0eSB3aXRoIG1vdXNlIHJlbGF0ZWQgZXZlbnRzXG4gKiBAdHJpZ2dlciBNb3VzZU92ZXIgLSB3aGVuIHRoZSBtb3VzZSBlbnRlcnMgdGhlIGVudGl0eSAtIE1vdXNlRXZlbnRcbiAqIEB0cmlnZ2VyIE1vdXNlT3V0IC0gd2hlbiB0aGUgbW91c2UgbGVhdmVzIHRoZSBlbnRpdHkgLSBNb3VzZUV2ZW50XG4gKiBAdHJpZ2dlciBNb3VzZURvd24gLSB3aGVuIHRoZSBtb3VzZSBidXR0b24gaXMgcHJlc3NlZCBvbiB0aGUgZW50aXR5IC0gTW91c2VFdmVudFxuICogQHRyaWdnZXIgTW91c2VVcCAtIHdoZW4gdGhlIG1vdXNlIGJ1dHRvbiBpcyByZWxlYXNlZCBvbiB0aGUgZW50aXR5IC0gTW91c2VFdmVudFxuICogQHRyaWdnZXIgQ2xpY2sgLSB3aGVuIHRoZSB1c2VyIGNsaWNrcyB0aGUgZW50aXR5LiBbU2VlIGRvY3VtZW50YXRpb25dKGh0dHA6Ly93d3cucXVpcmtzbW9kZS5vcmcvZG9tL2V2ZW50cy9jbGljay5odG1sKSAtIE1vdXNlRXZlbnRcbiAqIEB0cmlnZ2VyIERvdWJsZUNsaWNrIC0gd2hlbiB0aGUgdXNlciBkb3VibGUgY2xpY2tzIHRoZSBlbnRpdHkgLSBNb3VzZUV2ZW50XG4gKiBAdHJpZ2dlciBNb3VzZU1vdmUgLSB3aGVuIHRoZSBtb3VzZSBpcyBvdmVyIHRoZSBlbnRpdHkgYW5kIG1vdmVzIC0gTW91c2VFdmVudFxuICogQ3JhZnR5IGFkZHMgdGhlIG1vdXNlQnV0dG9uIHByb3BlcnR5IHRvIE1vdXNlRXZlbnRzIHRoYXQgbWF0Y2ggb25lIG9mXG4gKlxuICogLSBDcmFmdHkubW91c2VCdXR0b25zLkxFRlRcbiAqIC0gQ3JhZnR5Lm1vdXNlQnV0dG9ucy5SSUdIVFxuICogLSBDcmFmdHkubW91c2VCdXR0b25zLk1JRERMRVxuICpcbiAqIEBleGFtcGxlXG4gKiB+fn5cbiAqIG15RW50aXR5LmJpbmQoJ0NsaWNrJywgZnVuY3Rpb24oKSB7XG4gKiAgICAgIGNvbnNvbGUubG9nKFwiQ2xpY2tlZCEhXCIpO1xuICogfSlcbiAqXG4gKiBteUVudGl0eS5iaW5kKCdNb3VzZVVwJywgZnVuY3Rpb24oZSkge1xuICogICAgaWYoIGUubW91c2VCdXR0b24gPT0gQ3JhZnR5Lm1vdXNlQnV0dG9ucy5SSUdIVCApXG4gKiAgICAgICAgY29uc29sZS5sb2coXCJDbGlja2VkIHJpZ2h0IGJ1dHRvblwiKTtcbiAqIH0pXG4gKiB+fn5cbiAqIEBzZWUgQ3JhZnR5Lm1vdXNlRGlzcGF0Y2hcbiAqL1xuQ3JhZnR5LmMoXCJNb3VzZVwiLCB7XG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICBDcmFmdHkubW91c2VPYmpzKys7XG4gICAgICAgIHRoaXMuYmluZChcIlJlbW92ZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBDcmFmdHkubW91c2VPYmpzLS07XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5hcmVhTWFwXG4gICAgICogQGNvbXAgTW91c2VcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuYXJlYU1hcChDcmFmdHkucG9seWdvbiBwb2x5Z29uKVxuICAgICAqIEBwYXJhbSBwb2x5Z29uIC0gSW5zdGFuY2Ugb2YgQ3JhZnR5LnBvbHlnb24gdXNlZCB0byBjaGVjayBpZiB0aGUgbW91c2UgY29vcmRpbmF0ZXMgYXJlIGluc2lkZSB0aGlzIHJlZ2lvblxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5hcmVhTWFwKEFycmF5IHBvaW50MSwgLi4sIEFycmF5IHBvaW50TilcbiAgICAgKiBAcGFyYW0gcG9pbnQjIC0gQXJyYXkgd2l0aCBhbiBgeGAgYW5kIGB5YCBwb3NpdGlvbiB0byBnZW5lcmF0ZSBhIHBvbHlnb25cbiAgICAgKlxuICAgICAqIEFzc2lnbiBhIHBvbHlnb24gdG8gdGhlIGVudGl0eSBzbyB0aGF0IG1vdXNlIGV2ZW50cyB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGlmXG4gICAgICogdGhlIGNvb3JkaW5hdGVzIGFyZSBpbnNpZGUgdGhlIGdpdmVuIHBvbHlnb24uXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiMkQsIERPTSwgQ29sb3IsIE1vdXNlXCIpXG4gICAgICogICAgIC5jb2xvcihcInJlZFwiKVxuICAgICAqICAgICAuYXR0cih7IHc6IDEwMCwgaDogMTAwIH0pXG4gICAgICogICAgIC5iaW5kKCdNb3VzZU92ZXInLCBmdW5jdGlvbigpIHtjb25zb2xlLmxvZyhcIm92ZXJcIil9KVxuICAgICAqICAgICAuYXJlYU1hcChbMCwwXSwgWzUwLDBdLCBbNTAsNTBdLCBbMCw1MF0pXG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5wb2x5Z29uXG4gICAgICovXG4gICAgYXJlYU1hcDogZnVuY3Rpb24gKHBvbHkpIHtcbiAgICAgICAgLy9jcmVhdGUgcG9seWdvblxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vY29udmVydCBhcmdzIHRvIGFycmF5IHRvIGNyZWF0ZSBwb2x5Z29uXG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gICAgICAgICAgICBwb2x5ID0gbmV3IENyYWZ0eS5wb2x5Z29uKGFyZ3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgcG9seS5zaGlmdCh0aGlzLl94LCB0aGlzLl95KTtcbiAgICAgICAgLy90aGlzLm1hcCA9IHBvbHk7XG4gICAgICAgIHRoaXMubWFwQXJlYSA9IHBvbHk7XG5cbiAgICAgICAgdGhpcy5hdHRhY2godGhpcy5tYXBBcmVhKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICNEcmFnZ2FibGVcbiAqIEBjYXRlZ29yeSBJbnB1dFxuICogRW5hYmxlIGRyYWcgYW5kIGRyb3Agb2YgdGhlIGVudGl0eS5cbiAqIEB0cmlnZ2VyIERyYWdnaW5nIC0gaXMgdHJpZ2dlcmVkIGVhY2ggZnJhbWUgdGhlIGVudGl0eSBpcyBiZWluZyBkcmFnZ2VkIC0gTW91c2VFdmVudFxuICogQHRyaWdnZXIgU3RhcnREcmFnIC0gaXMgdHJpZ2dlcmVkIHdoZW4gZHJhZ2dpbmcgYmVnaW5zIC0gTW91c2VFdmVudFxuICogQHRyaWdnZXIgU3RvcERyYWcgLSBpcyB0cmlnZ2VyZWQgd2hlbiBkcmFnZ2luZyBlbmRzIC0gTW91c2VFdmVudFxuICovXG5DcmFmdHkuYyhcIkRyYWdnYWJsZVwiLCB7XG4gICAgX29yaWdNb3VzZURPTVBvczogbnVsbCxcbiAgICBfb2xkWDogbnVsbCxcbiAgICBfb2xkWTogbnVsbCxcbiAgICBfZHJhZ2dpbmc6IGZhbHNlLFxuICAgIF9kaXI6IG51bGwsXG5cbiAgICAvL05vdGU6IHRoZSBjb2RlIGlzIG5vdCB0ZXN0ZWQgd2l0aCB6b29tLCBldGMuLCB0aGF0IG1heSBkaXN0b3J0IHRoZSBkaXJlY3Rpb24gYmV0d2VlbiB0aGUgdmlld3BvcnQgYW5kIHRoZSBjb29yZGluYXRlIG9uIHRoZSBjYW52YXMuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlcXVpcmVzKFwiTW91c2VcIik7XG4gICAgICAgIHRoaXMuZW5hYmxlRHJhZygpO1xuICAgIH0sXG5cbiAgICBfb25kcmFnOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICAvLyBXaGlsZSBhIGRyYWcgaXMgb2NjdXJyaW5nLCB0aGlzIG1ldGhvZCBpcyBib3VuZCB0byB0aGUgbW91c2Vtb3ZlIERPTSBldmVudFxuICAgICAgICB2YXIgcG9zID0gQ3JhZnR5LkRPTS50cmFuc2xhdGUoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuXG4gICAgICAgIC8vIGlnbm9yZSBpbnZhbGlkIDAgMCBwb3NpdGlvbiAtIHN0cmFuZ2UgcHJvYmxlbSBvbiBpcGFkXG4gICAgICAgIGlmIChwb3MueCA9PT0gMCB8fCBwb3MueSA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuX2Rpcikge1xuICAgICAgICAgICAgdmFyIGxlbiA9IChwb3MueCAtIHRoaXMuX29yaWdNb3VzZURPTVBvcy54KSAqIHRoaXMuX2Rpci54ICsgKHBvcy55IC0gdGhpcy5fb3JpZ01vdXNlRE9NUG9zLnkpICogdGhpcy5fZGlyLnk7XG4gICAgICAgICAgICB0aGlzLnggPSB0aGlzLl9vbGRYICsgbGVuICogdGhpcy5fZGlyLng7XG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLl9vbGRZICsgbGVuICogdGhpcy5fZGlyLnk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnggPSB0aGlzLl9vbGRYICsgKHBvcy54IC0gdGhpcy5fb3JpZ01vdXNlRE9NUG9zLngpO1xuICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5fb2xkWSArIChwb3MueSAtIHRoaXMuX29yaWdNb3VzZURPTVBvcy55KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudHJpZ2dlcihcIkRyYWdnaW5nXCIsIGUpO1xuICAgIH0sXG5cbiAgICBfb25kb3duOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICAvLyBXaGVuIGRyYWdnaW5nIGlzIGVuYWJsZWQsIHRoaXMgbWV0aG9kIGlzIGJvdW5kIHRvIHRoZSBNb3VzZURvd24gY3JhZnR5IGV2ZW50XG4gICAgICAgIGlmIChlLm1vdXNlQnV0dG9uICE9PSBDcmFmdHkubW91c2VCdXR0b25zLkxFRlQpIHJldHVybjtcbiAgICAgICAgdGhpcy5fc3RhcnREcmFnKGUpO1xuICAgIH0sXG5cbiAgICBfb251cDogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgLy8gV2hpbGUgYSBkcmFnIGlzIG9jY3VycmluZywgdGhpcyBtZXRob2QgaXMgYm91bmQgdG8gbW91c2V1cCBET00gZXZlbnRcbiAgICAgICAgaWYgKHRoaXMuX2RyYWdnaW5nID09PSB0cnVlKSB7XG4gICAgICAgICAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2Vtb3ZlXCIsIHRoaXMuX29uZHJhZyk7XG4gICAgICAgICAgICBDcmFmdHkucmVtb3ZlRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2V1cFwiLCB0aGlzLl9vbnVwKTtcbiAgICAgICAgICAgIHRoaXMuX2RyYWdnaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJTdG9wRHJhZ1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5kcmFnRGlyZWN0aW9uXG4gICAgICogQGNvbXAgRHJhZ2dhYmxlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmRyYWdEaXJlY3Rpb24oKVxuICAgICAqIFJlbW92ZSBhbnkgcHJldmlvdXNseSBzcGVjaWZpZWQgZGlyZWN0aW9uLlxuICAgICAqXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmRyYWdEaXJlY3Rpb24odmVjdG9yKVxuICAgICAqIEBwYXJhbSB2ZWN0b3IgLSBPZiB0aGUgZm9ybSBvZiB7eDogdmFseCwgeTogdmFseX0sIHRoZSB2ZWN0b3IgKHZhbHgsIHZhbHkpIGRlbm90ZXMgdGhlIG1vdmUgZGlyZWN0aW9uLlxuICAgICAqXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmRyYWdEaXJlY3Rpb24oZGVncmVlKVxuICAgICAqIEBwYXJhbSBkZWdyZWUgLSBBIG51bWJlciwgdGhlIGRlZ3JlZSAoY2xvY2t3aXNlKSBvZiB0aGUgbW92ZSBkaXJlY3Rpb24gd2l0aCByZXNwZWN0IHRvIHRoZSB4IGF4aXMuXG4gICAgICogU3BlY2lmeSB0aGUgZHJhZ2dpbmcgZGlyZWN0aW9uLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB0aGlzLmRyYWdEaXJlY3Rpb24oKVxuICAgICAqIHRoaXMuZHJhZ0RpcmVjdGlvbih7eDoxLCB5OjB9KSAvL0hvcml6b250YWxcbiAgICAgKiB0aGlzLmRyYWdEaXJlY3Rpb24oe3g6MCwgeToxfSkgLy9WZXJ0aWNhbFxuICAgICAqIC8vIE5vdGU6IGJlY2F1c2Ugb2YgdGhlIG9yaWVudGF0aW9uIG9mIHggYW5kIHkgYXhpcyxcbiAgICAgKiAvLyB0aGlzIGlzIDQ1IGRlZ3JlZSBjbG9ja3dpc2Ugd2l0aCByZXNwZWN0IHRvIHRoZSB4IGF4aXMuXG4gICAgICogdGhpcy5kcmFnRGlyZWN0aW9uKHt4OjEsIHk6MX0pIC8vNDUgZGVncmVlLlxuICAgICAqIHRoaXMuZHJhZ0RpcmVjdGlvbig2MCkgLy82MCBkZWdyZWUuXG4gICAgICogfn5+XG4gICAgICovXG4gICAgZHJhZ0RpcmVjdGlvbjogZnVuY3Rpb24gKGRpcikge1xuICAgICAgICBpZiAodHlwZW9mIGRpciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX2RpciA9IG51bGw7XG4gICAgICAgIH0gZWxzZSBpZiAoKFwiXCIgKyBwYXJzZUludChkaXIsIDEwKSkgPT0gZGlyKSB7IC8vZGlyIGlzIGEgbnVtYmVyXG4gICAgICAgICAgICB0aGlzLl9kaXIgPSB7XG4gICAgICAgICAgICAgICAgeDogTWF0aC5jb3MoZGlyIC8gMTgwICogTWF0aC5QSSksXG4gICAgICAgICAgICAgICAgeTogTWF0aC5zaW4oZGlyIC8gMTgwICogTWF0aC5QSSlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgciA9IE1hdGguc3FydChkaXIueCAqIGRpci54ICsgZGlyLnkgKiBkaXIueSk7XG4gICAgICAgICAgICB0aGlzLl9kaXIgPSB7XG4gICAgICAgICAgICAgICAgeDogZGlyLnggLyByLFxuICAgICAgICAgICAgICAgIHk6IGRpci55IC8gclxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cblxuICAgIC8qKkBcbiAgICAgKiAjLl9zdGFydERyYWdcbiAgICAgKiBAY29tcCBEcmFnZ2FibGVcbiAgICAgKiBJbnRlcm5hbCBtZXRob2QgZm9yIHN0YXJ0aW5nIGEgZHJhZyBvZiBhbiBlbnRpdHkgZWl0aGVyIHByb2dyYW1hdGljYWxseSBvciB2aWEgTW91c2UgY2xpY2tcbiAgICAgKlxuICAgICAqIEBwYXJhbSBlIC0gYSBtb3VzZSBldmVudFxuICAgICAqL1xuICAgIF9zdGFydERyYWc6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIHRoaXMuX29yaWdNb3VzZURPTVBvcyA9IENyYWZ0eS5ET00udHJhbnNsYXRlKGUuY2xpZW50WCwgZS5jbGllbnRZKTtcbiAgICAgICAgdGhpcy5fb2xkWCA9IHRoaXMuX3g7XG4gICAgICAgIHRoaXMuX29sZFkgPSB0aGlzLl95O1xuICAgICAgICB0aGlzLl9kcmFnZ2luZyA9IHRydWU7XG5cbiAgICAgICAgQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcIm1vdXNlbW92ZVwiLCB0aGlzLl9vbmRyYWcpO1xuICAgICAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2V1cFwiLCB0aGlzLl9vbnVwKTtcbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiU3RhcnREcmFnXCIsIGUpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5zdG9wRHJhZ1xuICAgICAqIEBjb21wIERyYWdnYWJsZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5zdG9wRHJhZyh2b2lkKVxuICAgICAqIEB0cmlnZ2VyIFN0b3BEcmFnIC0gQ2FsbGVkIHJpZ2h0IGFmdGVyIHRoZSBtb3VzZSBsaXN0ZW5lcnMgYXJlIHJlbW92ZWRcbiAgICAgKlxuICAgICAqIFN0b3AgdGhlIGVudGl0eSBmcm9tIGRyYWdnaW5nLiBFc3NlbnRpYWxseSByZXByb2R1Y2luZyB0aGUgZHJvcC5cbiAgICAgKlxuICAgICAqIEBzZWUgLnN0YXJ0RHJhZ1xuICAgICAqL1xuICAgIHN0b3BEcmFnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIENyYWZ0eS5yZW1vdmVFdmVudCh0aGlzLCBDcmFmdHkuc3RhZ2UuZWxlbSwgXCJtb3VzZW1vdmVcIiwgdGhpcy5fb25kcmFnKTtcbiAgICAgICAgQ3JhZnR5LnJlbW92ZUV2ZW50KHRoaXMsIENyYWZ0eS5zdGFnZS5lbGVtLCBcIm1vdXNldXBcIiwgdGhpcy5fb251cCk7XG5cbiAgICAgICAgdGhpcy5fZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiU3RvcERyYWdcIik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5zdGFydERyYWdcbiAgICAgKiBAY29tcCBEcmFnZ2FibGVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuc3RhcnREcmFnKHZvaWQpXG4gICAgICpcbiAgICAgKiBNYWtlIHRoZSBlbnRpdHkgZm9sbG93IHRoZSBtb3VzZSBwb3NpdGlvbnMuXG4gICAgICpcbiAgICAgKiBAc2VlIC5zdG9wRHJhZ1xuICAgICAqL1xuICAgIHN0YXJ0RHJhZzogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXRoaXMuX2RyYWdnaW5nKSB7XG4gICAgICAgICAgICAvL1VzZSB0aGUgbGFzdCBrbm93biBwb3NpdGlvbiBvZiB0aGUgbW91c2VcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0RHJhZyhDcmFmdHkubGFzdEV2ZW50KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuZW5hYmxlRHJhZ1xuICAgICAqIEBjb21wIERyYWdnYWJsZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5lbmFibGVEcmFnKHZvaWQpXG4gICAgICpcbiAgICAgKiBSZWJpbmQgdGhlIG1vdXNlIGV2ZW50cy4gVXNlIGlmIGAuZGlzYWJsZURyYWdgIGhhcyBiZWVuIGNhbGxlZC5cbiAgICAgKlxuICAgICAqIEBzZWUgLmRpc2FibGVEcmFnXG4gICAgICovXG4gICAgZW5hYmxlRHJhZzogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLmJpbmQoXCJNb3VzZURvd25cIiwgdGhpcy5fb25kb3duKTtcblxuICAgICAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2V1cFwiLCB0aGlzLl9vbnVwKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmRpc2FibGVEcmFnXG4gICAgICogQGNvbXAgRHJhZ2dhYmxlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmRpc2FibGVEcmFnKHZvaWQpXG4gICAgICpcbiAgICAgKiBTdG9wcyBlbnRpdHkgZnJvbSBiZWluZyBkcmFnZ2FibGUuIFJlZW5hYmxlIHdpdGggYC5lbmFibGVEcmFnKClgLlxuICAgICAqXG4gICAgICogQHNlZSAuZW5hYmxlRHJhZ1xuICAgICAqL1xuICAgIGRpc2FibGVEcmFnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudW5iaW5kKFwiTW91c2VEb3duXCIsIHRoaXMuX29uZG93bik7XG4gICAgICAgIGlmICh0aGlzLl9kcmFnZ2luZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wRHJhZygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjS2V5Ym9hcmRcbiAqIEBjYXRlZ29yeSBJbnB1dFxuICogR2l2ZSBlbnRpdGllcyBrZXlib2FyZCBldmVudHMgKGBrZXlkb3duYCBhbmQgYGtleXVwYCkuXG4gKi9cbkNyYWZ0eS5jKFwiS2V5Ym9hcmRcIiwge1xuICAgIC8qKkBcbiAgICAgKiAjLmlzRG93blxuICAgICAqIEBjb21wIEtleWJvYXJkXG4gICAgICogQHNpZ24gcHVibGljIEJvb2xlYW4gaXNEb3duKFN0cmluZyBrZXlOYW1lKVxuICAgICAqIEBwYXJhbSBrZXlOYW1lIC0gTmFtZSBvZiB0aGUga2V5IHRvIGNoZWNrLiBTZWUgYENyYWZ0eS5rZXlzYC5cbiAgICAgKiBAc2lnbiBwdWJsaWMgQm9vbGVhbiBpc0Rvd24oTnVtYmVyIGtleUNvZGUpXG4gICAgICogQHBhcmFtIGtleUNvZGUgLSBLZXkgY29kZSBpbiBgQ3JhZnR5LmtleXNgLlxuICAgICAqXG4gICAgICogRGV0ZXJtaW5lIGlmIGEgY2VydGFpbiBrZXkgaXMgY3VycmVudGx5IGRvd24uXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIGVudGl0eS5yZXF1aXJlcygnS2V5Ym9hcmQnKS5iaW5kKCdLZXlEb3duJywgZnVuY3Rpb24gKCkgeyBpZiAodGhpcy5pc0Rvd24oJ1NQQUNFJykpIGp1bXAoKTsgfSk7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5rZXlzXG4gICAgICovXG4gICAgaXNEb3duOiBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIGlmICh0eXBlb2Yga2V5ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBrZXkgPSBDcmFmdHkua2V5c1trZXldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAhIUNyYWZ0eS5rZXlkb3duW2tleV07XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICNNdWx0aXdheVxuICogQGNhdGVnb3J5IElucHV0XG4gKiBVc2VkIHRvIGJpbmQga2V5cyB0byBkaXJlY3Rpb25zIGFuZCBoYXZlIHRoZSBlbnRpdHkgbW92ZSBhY2NvcmRpbmdseVxuICogQHRyaWdnZXIgTmV3RGlyZWN0aW9uIC0gdHJpZ2dlcmVkIHdoZW4gZGlyZWN0aW9uIGNoYW5nZXMgLSB7IHg6TnVtYmVyLCB5Ok51bWJlciB9IC0gTmV3IGRpcmVjdGlvblxuICogQHRyaWdnZXIgTW92ZWQgLSB0cmlnZ2VyZWQgb24gbW92ZW1lbnQgb24gZWl0aGVyIHggb3IgeSBheGlzLiBJZiB0aGUgZW50aXR5IGhhcyBtb3ZlZCBvbiBib3RoIGF4ZXMgZm9yIGRpYWdvbmFsIG1vdmVtZW50IHRoZSBldmVudCBpcyB0cmlnZ2VyZWQgdHdpY2UgLSB7IHg6TnVtYmVyLCB5Ok51bWJlciB9IC0gT2xkIHBvc2l0aW9uXG4gKi9cbkNyYWZ0eS5jKFwiTXVsdGl3YXlcIiwge1xuICAgIF9zcGVlZDogMyxcblxuICAgIF9rZXlkb3duOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICBpZiAodGhpcy5fa2V5c1tlLmtleV0pIHtcbiAgICAgICAgICAgIHRoaXMuX21vdmVtZW50LnggPSBNYXRoLnJvdW5kKCh0aGlzLl9tb3ZlbWVudC54ICsgdGhpcy5fa2V5c1tlLmtleV0ueCkgKiAxMDAwKSAvIDEwMDA7XG4gICAgICAgICAgICB0aGlzLl9tb3ZlbWVudC55ID0gTWF0aC5yb3VuZCgodGhpcy5fbW92ZW1lbnQueSArIHRoaXMuX2tleXNbZS5rZXldLnkpICogMTAwMCkgLyAxMDAwO1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdOZXdEaXJlY3Rpb24nLCB0aGlzLl9tb3ZlbWVudCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2tleXVwOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICBpZiAodGhpcy5fa2V5c1tlLmtleV0pIHtcbiAgICAgICAgICAgIHRoaXMuX21vdmVtZW50LnggPSBNYXRoLnJvdW5kKCh0aGlzLl9tb3ZlbWVudC54IC0gdGhpcy5fa2V5c1tlLmtleV0ueCkgKiAxMDAwKSAvIDEwMDA7XG4gICAgICAgICAgICB0aGlzLl9tb3ZlbWVudC55ID0gTWF0aC5yb3VuZCgodGhpcy5fbW92ZW1lbnQueSAtIHRoaXMuX2tleXNbZS5rZXldLnkpICogMTAwMCkgLyAxMDAwO1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdOZXdEaXJlY3Rpb24nLCB0aGlzLl9tb3ZlbWVudCk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2VudGVyZnJhbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzYWJsZUNvbnRyb2xzKSByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuX21vdmVtZW50LnggIT09IDApIHtcbiAgICAgICAgICAgIHRoaXMueCArPSB0aGlzLl9tb3ZlbWVudC54O1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdNb3ZlZCcsIHtcbiAgICAgICAgICAgICAgICB4OiB0aGlzLnggLSB0aGlzLl9tb3ZlbWVudC54LFxuICAgICAgICAgICAgICAgIHk6IHRoaXMueVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX21vdmVtZW50LnkgIT09IDApIHtcbiAgICAgICAgICAgIHRoaXMueSArPSB0aGlzLl9tb3ZlbWVudC55O1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdNb3ZlZCcsIHtcbiAgICAgICAgICAgICAgICB4OiB0aGlzLngsXG4gICAgICAgICAgICAgICAgeTogdGhpcy55IC0gdGhpcy5fbW92ZW1lbnQueVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgX2luaXRpYWxpemVDb250cm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnVuYmluZChcIktleURvd25cIiwgdGhpcy5fa2V5ZG93bilcbiAgICAgICAgICAgIC51bmJpbmQoXCJLZXlVcFwiLCB0aGlzLl9rZXl1cClcbiAgICAgICAgICAgIC51bmJpbmQoXCJFbnRlckZyYW1lXCIsIHRoaXMuX2VudGVyZnJhbWUpXG4gICAgICAgICAgICAuYmluZChcIktleURvd25cIiwgdGhpcy5fa2V5ZG93bilcbiAgICAgICAgICAgIC5iaW5kKFwiS2V5VXBcIiwgdGhpcy5fa2V5dXApXG4gICAgICAgICAgICAuYmluZChcIkVudGVyRnJhbWVcIiwgdGhpcy5fZW50ZXJmcmFtZSk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLm11bHRpd2F5XG4gICAgICogQGNvbXAgTXVsdGl3YXlcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAubXVsdGl3YXkoW051bWJlciBzcGVlZCxdIE9iamVjdCBrZXlCaW5kaW5ncyApXG4gICAgICogQHBhcmFtIHNwZWVkIC0gQW1vdW50IG9mIHBpeGVscyB0byBtb3ZlIHRoZSBlbnRpdHkgd2hpbHN0IGEga2V5IGlzIGRvd25cbiAgICAgKiBAcGFyYW0ga2V5QmluZGluZ3MgLSBXaGF0IGtleXMgc2hvdWxkIG1ha2UgdGhlIGVudGl0eSBnbyBpbiB3aGljaCBkaXJlY3Rpb24uIERpcmVjdGlvbiBpcyBzcGVjaWZpZWQgaW4gZGVncmVlc1xuICAgICAqIENvbnN0cnVjdG9yIHRvIGluaXRpYWxpemUgdGhlIHNwZWVkIGFuZCBrZXlCaW5kaW5ncy4gQ29tcG9uZW50IHdpbGwgbGlzdGVuIHRvIGtleSBldmVudHMgYW5kIG1vdmUgdGhlIGVudGl0eSBhcHByb3ByaWF0ZWx5LlxuICAgICAqXG4gICAgICogV2hlbiBkaXJlY3Rpb24gY2hhbmdlcyBhIE5ld0RpcmVjdGlvbiBldmVudCBpcyB0cmlnZ2VyZWQgd2l0aCBhbiBvYmplY3QgZGV0YWlsaW5nIHRoZSBuZXcgZGlyZWN0aW9uOiB7eDogeF9tb3ZlbWVudCwgeTogeV9tb3ZlbWVudH1cbiAgICAgKiBXaGVuIGVudGl0eSBoYXMgbW92ZWQgb24gZWl0aGVyIHgtIG9yIHktYXhpcyBhIE1vdmVkIGV2ZW50IGlzIHRyaWdnZXJlZCB3aXRoIGFuIG9iamVjdCBzcGVjaWZ5aW5nIHRoZSBvbGQgcG9zaXRpb24ge3g6IG9sZF94LCB5OiBvbGRfeX1cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogdGhpcy5tdWx0aXdheSgzLCB7VVBfQVJST1c6IC05MCwgRE9XTl9BUlJPVzogOTAsIFJJR0hUX0FSUk9XOiAwLCBMRUZUX0FSUk9XOiAxODB9KTtcbiAgICAgKiB0aGlzLm11bHRpd2F5KHt4OjMseToxLjV9LCB7VVBfQVJST1c6IC05MCwgRE9XTl9BUlJPVzogOTAsIFJJR0hUX0FSUk9XOiAwLCBMRUZUX0FSUk9XOiAxODB9KTtcbiAgICAgKiB0aGlzLm11bHRpd2F5KHtXOiAtOTAsIFM6IDkwLCBEOiAwLCBBOiAxODB9KTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBtdWx0aXdheTogZnVuY3Rpb24gKHNwZWVkLCBrZXlzKSB7XG4gICAgICAgIHRoaXMuX2tleURpcmVjdGlvbiA9IHt9O1xuICAgICAgICB0aGlzLl9rZXlzID0ge307XG4gICAgICAgIHRoaXMuX21vdmVtZW50ID0ge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDBcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5fc3BlZWQgPSB7XG4gICAgICAgICAgICB4OiAzLFxuICAgICAgICAgICAgeTogM1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChrZXlzKSB7XG4gICAgICAgICAgICBpZiAoc3BlZWQueCAhPT0gdW5kZWZpbmVkICYmIHNwZWVkLnkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NwZWVkLnggPSBzcGVlZC54O1xuICAgICAgICAgICAgICAgIHRoaXMuX3NwZWVkLnkgPSBzcGVlZC55O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zcGVlZC54ID0gc3BlZWQ7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3BlZWQueSA9IHNwZWVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAga2V5cyA9IHNwZWVkO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fa2V5RGlyZWN0aW9uID0ga2V5cztcbiAgICAgICAgdGhpcy5zcGVlZCh0aGlzLl9zcGVlZCk7XG5cbiAgICAgICAgdGhpcy5faW5pdGlhbGl6ZUNvbnRyb2woKTtcblxuICAgICAgICAvL0FwcGx5IG1vdmVtZW50IGlmIGtleSBpcyBkb3duIHdoZW4gY3JlYXRlZFxuICAgICAgICBmb3IgKHZhciBrIGluIGtleXMpIHtcbiAgICAgICAgICAgIGlmIChDcmFmdHkua2V5ZG93bltDcmFmdHkua2V5c1trXV0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJLZXlEb3duXCIsIHtcbiAgICAgICAgICAgICAgICAgICAga2V5OiBDcmFmdHkua2V5c1trXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmVuYWJsZUNvbnRyb2xcbiAgICAgKiBAY29tcCBNdWx0aXdheVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5lbmFibGVDb250cm9sKClcbiAgICAgKlxuICAgICAqIEVuYWJsZSB0aGUgY29tcG9uZW50IHRvIGxpc3RlbiB0byBrZXkgZXZlbnRzLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB0aGlzLmVuYWJsZUNvbnRyb2woKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBlbmFibGVDb250cm9sOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuZGlzYWJsZUNvbnRyb2xzID0gZmFsc2U7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5kaXNhYmxlQ29udHJvbFxuICAgICAqIEBjb21wIE11bHRpd2F5XG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmRpc2FibGVDb250cm9sKClcbiAgICAgKlxuICAgICAqIERpc2FibGUgdGhlIGNvbXBvbmVudCB0byBsaXN0ZW4gdG8ga2V5IGV2ZW50cy5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogdGhpcy5kaXNhYmxlQ29udHJvbCgpO1xuICAgICAqIH5+flxuICAgICAqL1xuXG4gICAgZGlzYWJsZUNvbnRyb2w6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5kaXNhYmxlQ29udHJvbHMgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgc3BlZWQ6IGZ1bmN0aW9uIChzcGVlZCkge1xuICAgICAgICBmb3IgKHZhciBrIGluIHRoaXMuX2tleURpcmVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGtleUNvZGUgPSBDcmFmdHkua2V5c1trXSB8fCBrO1xuICAgICAgICAgICAgdGhpcy5fa2V5c1trZXlDb2RlXSA9IHtcbiAgICAgICAgICAgICAgICB4OiBNYXRoLnJvdW5kKE1hdGguY29zKHRoaXMuX2tleURpcmVjdGlvbltrXSAqIChNYXRoLlBJIC8gMTgwKSkgKiAxMDAwICogc3BlZWQueCkgLyAxMDAwLFxuICAgICAgICAgICAgICAgIHk6IE1hdGgucm91bmQoTWF0aC5zaW4odGhpcy5fa2V5RGlyZWN0aW9uW2tdICogKE1hdGguUEkgLyAxODApKSAqIDEwMDAgKiBzcGVlZC55KSAvIDEwMDBcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICNGb3Vyd2F5XG4gKiBAY2F0ZWdvcnkgSW5wdXRcbiAqIE1vdmUgYW4gZW50aXR5IGluIGZvdXIgZGlyZWN0aW9ucyBieSB1c2luZyB0aGVcbiAqIGFycm93IGtleXMgb3IgYFdgLCBgQWAsIGBTYCwgYERgLlxuICovXG5DcmFmdHkuYyhcIkZvdXJ3YXlcIiwge1xuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlcXVpcmVzKFwiTXVsdGl3YXlcIik7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmZvdXJ3YXlcbiAgICAgKiBAY29tcCBGb3Vyd2F5XG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmZvdXJ3YXkoTnVtYmVyIHNwZWVkKVxuICAgICAqIEBwYXJhbSBzcGVlZCAtIEFtb3VudCBvZiBwaXhlbHMgdG8gbW92ZSB0aGUgZW50aXR5IHdoaWxzdCBhIGtleSBpcyBkb3duXG4gICAgICogQ29uc3RydWN0b3IgdG8gaW5pdGlhbGl6ZSB0aGUgc3BlZWQuIENvbXBvbmVudCB3aWxsIGxpc3RlbiBmb3Iga2V5IGV2ZW50cyBhbmQgbW92ZSB0aGUgZW50aXR5IGFwcHJvcHJpYXRlbHkuXG4gICAgICogVGhpcyBpbmNsdWRlcyBgVXAgQXJyb3dgLCBgUmlnaHQgQXJyb3dgLCBgRG93biBBcnJvd2AsIGBMZWZ0IEFycm93YCBhcyB3ZWxsIGFzIGBXYCwgYEFgLCBgU2AsIGBEYC5cbiAgICAgKlxuICAgICAqIFdoZW4gZGlyZWN0aW9uIGNoYW5nZXMgYSBOZXdEaXJlY3Rpb24gZXZlbnQgaXMgdHJpZ2dlcmVkIHdpdGggYW4gb2JqZWN0IGRldGFpbGluZyB0aGUgbmV3IGRpcmVjdGlvbjoge3g6IHhfbW92ZW1lbnQsIHk6IHlfbW92ZW1lbnR9XG4gICAgICogV2hlbiBlbnRpdHkgaGFzIG1vdmVkIG9uIGVpdGhlciB4LSBvciB5LWF4aXMgYSBNb3ZlZCBldmVudCBpcyB0cmlnZ2VyZWQgd2l0aCBhbiBvYmplY3Qgc3BlY2lmeWluZyB0aGUgb2xkIHBvc2l0aW9uIHt4OiBvbGRfeCwgeTogb2xkX3l9XG4gICAgICpcbiAgICAgKiBUaGUga2V5IHByZXNzZXMgd2lsbCBtb3ZlIHRoZSBlbnRpdHkgaW4gdGhhdCBkaXJlY3Rpb24gYnkgdGhlIHNwZWVkIHBhc3NlZCBpbiB0aGUgYXJndW1lbnQuXG4gICAgICpcbiAgICAgKiBAc2VlIE11bHRpd2F5XG4gICAgICovXG4gICAgZm91cndheTogZnVuY3Rpb24gKHNwZWVkKSB7XG4gICAgICAgIHRoaXMubXVsdGl3YXkoc3BlZWQsIHtcbiAgICAgICAgICAgIFVQX0FSUk9XOiAtOTAsXG4gICAgICAgICAgICBET1dOX0FSUk9XOiA5MCxcbiAgICAgICAgICAgIFJJR0hUX0FSUk9XOiAwLFxuICAgICAgICAgICAgTEVGVF9BUlJPVzogMTgwLFxuICAgICAgICAgICAgVzogLTkwLFxuICAgICAgICAgICAgUzogOTAsXG4gICAgICAgICAgICBEOiAwLFxuICAgICAgICAgICAgQTogMTgwLFxuICAgICAgICAgICAgWjogLTkwLFxuICAgICAgICAgICAgUTogMTgwXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjVHdvd2F5XG4gKiBAY2F0ZWdvcnkgSW5wdXRcbiAqIEB0cmlnZ2VyIE5ld0RpcmVjdGlvbiAtIFdoZW4gZGlyZWN0aW9uIGNoYW5nZXMgYSBOZXdEaXJlY3Rpb24gZXZlbnQgaXMgdHJpZ2dlcmVkIHdpdGggYW4gb2JqZWN0IGRldGFpbGluZyB0aGUgbmV3IGRpcmVjdGlvbjoge3g6IHhfbW92ZW1lbnQsIHk6IHlfbW92ZW1lbnR9LiBUaGlzIGlzIGNvbnNpc3RlbnQgd2l0aCBGb3Vyd2F5IGFuZCBNdWx0aXdheSBjb21wb25lbnRzLlxuICogQHRyaWdnZXIgTW92ZWQgLSBXaGVuIGVudGl0eSBoYXMgbW92ZWQgb24geC1heGlzIGEgTW92ZWQgZXZlbnQgaXMgdHJpZ2dlcmVkIHdpdGggYW4gb2JqZWN0IHNwZWNpZnlpbmcgdGhlIG9sZCBwb3NpdGlvbiB7eDogb2xkX3gsIHk6IG9sZF95fVxuICogXG4gKiBNb3ZlIGFuIGVudGl0eSBsZWZ0IG9yIHJpZ2h0IHVzaW5nIHRoZSBhcnJvdyBrZXlzIG9yIGBEYCBhbmQgYEFgIGFuZCBqdW1wIHVzaW5nIHVwIGFycm93IG9yIGBXYC5cbiAqL1xuQ3JhZnR5LmMoXCJUd293YXlcIiwge1xuICAgIF9zcGVlZDogMyxcbiAgICBfdXA6IGZhbHNlLFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnJlcXVpcmVzKFwiRm91cndheSwgS2V5Ym9hcmQsIEdyYXZpdHlcIik7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLnR3b3dheVxuICAgICAqIEBjb21wIFR3b3dheVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC50d293YXkoTnVtYmVyIHNwZWVkWywgTnVtYmVyIGp1bXBdKVxuICAgICAqIEBwYXJhbSBzcGVlZCAtIEFtb3VudCBvZiBwaXhlbHMgdG8gbW92ZSBsZWZ0IG9yIHJpZ2h0XG4gICAgICogQHBhcmFtIGp1bXAgLSBWZXJ0aWNhbCBqdW1wIHNwZWVkXG4gICAgICpcbiAgICAgKiBDb25zdHJ1Y3RvciB0byBpbml0aWFsaXplIHRoZSBzcGVlZCBhbmQgcG93ZXIgb2YganVtcC4gQ29tcG9uZW50IHdpbGxcbiAgICAgKiBsaXN0ZW4gZm9yIGtleSBldmVudHMgYW5kIG1vdmUgdGhlIGVudGl0eSBhcHByb3ByaWF0ZWx5LiBUaGlzIGluY2x1ZGVzXG4gICAgICogYFVwIEFycm93YCwgYFJpZ2h0IEFycm93YCwgYExlZnQgQXJyb3dgIGFzIHdlbGwgYXMgYFdgLCBgQWAsIGBEYC4gVXNlZCB3aXRoIHRoZVxuICAgICAqIGBncmF2aXR5YCBjb21wb25lbnQgdG8gc2ltdWxhdGUganVtcGluZy5cbiAgICAgKlxuICAgICAqIFRoZSBrZXkgcHJlc3NlcyB3aWxsIG1vdmUgdGhlIGVudGl0eSBpbiB0aGF0IGRpcmVjdGlvbiBieSB0aGUgc3BlZWQgcGFzc2VkIGluXG4gICAgICogdGhlIGFyZ3VtZW50LiBQcmVzc2luZyB0aGUgYFVwIEFycm93YCBvciBgV2Agd2lsbCBjYXVzZSB0aGUgZW50aXR5IHRvIGp1bXAuXG4gICAgICpcbiAgICAgKiBAc2VlIEdyYXZpdHksIEZvdXJ3YXlcbiAgICAgKi9cbiAgICB0d293YXk6IGZ1bmN0aW9uIChzcGVlZCwganVtcCkge1xuXG4gICAgICAgIHRoaXMubXVsdGl3YXkoc3BlZWQsIHtcbiAgICAgICAgICAgIFJJR0hUX0FSUk9XOiAwLFxuICAgICAgICAgICAgTEVGVF9BUlJPVzogMTgwLFxuICAgICAgICAgICAgRDogMCxcbiAgICAgICAgICAgIEE6IDE4MCxcbiAgICAgICAgICAgIFE6IDE4MFxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoc3BlZWQpIHRoaXMuX3NwZWVkID0gc3BlZWQ7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMil7XG4gICAgICAgICAgdGhpcy5fanVtcFNwZWVkID0gdGhpcy5fc3BlZWQgKiAyO1xuICAgICAgICB9IGVsc2V7XG4gICAgICAgICAgdGhpcy5fanVtcFNwZWVkID0ganVtcDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmluZChcIkVudGVyRnJhbWVcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZGlzYWJsZUNvbnRyb2xzKSByZXR1cm47XG4gICAgICAgICAgICBpZiAodGhpcy5fdXApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnkgLT0gdGhpcy5fanVtcFNwZWVkO1xuICAgICAgICAgICAgICAgIHRoaXMuX2ZhbGxpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcignTW92ZWQnLCB7IHg6IHRoaXMuX3gsIHk6IHRoaXMuX3kgKyB0aGlzLl9qdW1wU3BlZWQgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmJpbmQoXCJLZXlEb3duXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX2ZhbGxpbmcgJiYgKGUua2V5ID09PSBDcmFmdHkua2V5cy5VUF9BUlJPVyB8fCBlLmtleSA9PT0gQ3JhZnR5LmtleXMuVyB8fCBlLmtleSA9PT0gQ3JhZnR5LmtleXMuWikpXG4gICAgICAgICAgICAgICAgdGhpcy5fdXAgPSB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59KTtcbiIsInZhciB2ZXJzaW9uID0gcmVxdWlyZSgnLi92ZXJzaW9uJyk7XG5cbi8qKkBcbiAqICNDcmFmdHlcbiAqIEBjYXRlZ29yeSBDb3JlXG4gKiBTZWxlY3QgYSBzZXQgb2Ygb3Igc2luZ2xlIGVudGl0aWVzIGJ5IGNvbXBvbmVudHMgb3IgYW4gZW50aXR5J3MgSUQuXG4gKlxuICogQ3JhZnR5IHVzZXMgc3ludGF4IHNpbWlsYXIgdG8galF1ZXJ5IGJ5IGhhdmluZyBhIHNlbGVjdG9yIGVuZ2luZSB0byBzZWxlY3QgZW50aXRpZXMgYnkgdGhlaXIgY29tcG9uZW50cy5cbiAqXG4gKiBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIG1hdGNoLCB0aGUgcmV0dXJuIHZhbHVlIGlzIGFuIEFycmF5LWxpa2Ugb2JqZWN0IGxpc3RpbmcgdGhlIElEIG51bWJlcnMgb2YgZWFjaCBtYXRjaGluZyBlbnRpdHkuIElmIHRoZXJlIGlzIGV4YWN0bHkgb25lIG1hdGNoLCB0aGUgZW50aXR5IGl0c2VsZiBpcyByZXR1cm5lZC4gSWYgeW91J3JlIG5vdCBzdXJlIGhvdyBtYW55IG1hdGNoZXMgdG8gZXhwZWN0LCBjaGVjayB0aGUgbnVtYmVyIG9mIG1hdGNoZXMgdmlhIENyYWZ0eSguLi4pLmxlbmd0aC4gQWx0ZXJuYXRpdmVseSwgdXNlIENyYWZ0eSguLi4pLmVhY2goLi4uKSwgd2hpY2ggd29ya3MgaW4gYWxsIGNhc2VzLlxuICpcbiAqIEBleGFtcGxlXG4gKiB+fn5cbiAqICAgIENyYWZ0eShcIk15Q29tcG9uZW50XCIpXG4gKiAgICBDcmFmdHkoXCJIZWxsbyAyRCBDb21wb25lbnRcIilcbiAqICAgIENyYWZ0eShcIkhlbGxvLCAyRCwgQ29tcG9uZW50XCIpXG4gKiB+fn5cbiAqXG4gKiBUaGUgZmlyc3Qgc2VsZWN0b3Igd2lsbCByZXR1cm4gYWxsIGVudGl0aWVzIHRoYXQgaGF2ZSB0aGUgY29tcG9uZW50IGBNeUNvbXBvbmVudGAuIFRoZSBzZWNvbmQgd2lsbCByZXR1cm4gYWxsIGVudGl0aWVzIHRoYXQgaGF2ZSBgSGVsbG9gIGFuZCBgMkRgIGFuZCBgQ29tcG9uZW50YCB3aGVyZWFzIHRoZSBsYXN0IHdpbGwgcmV0dXJuIGFsbCBlbnRpdGllcyB0aGF0IGhhdmUgYXQgbGVhc3Qgb25lIG9mIHRob3NlIGNvbXBvbmVudHMgKG9yKS5cbiAqXG4gKiB+fn5cbiAqICAgQ3JhZnR5KFwiKlwiKVxuICogfn5+XG4gKiBQYXNzaW5nIGAqYCB3aWxsIHNlbGVjdCBhbGwgZW50aXRpZXMuXG4gKlxuICogfn5+XG4gKiAgIENyYWZ0eSgxKVxuICogfn5+XG4gKiBQYXNzaW5nIGFuIGludGVnZXIgd2lsbCBzZWxlY3QgdGhlIGVudGl0eSB3aXRoIHRoYXQgYElEYC5cbiAqXG4gKiBUbyB3b3JrIGRpcmVjdGx5IHdpdGggYW4gYXJyYXkgb2YgZW50aXRpZXMsIHVzZSB0aGUgYGdldCgpYCBtZXRob2Qgb24gYSBzZWxlY3Rpb24uXG4gKiBUbyBjYWxsIGEgZnVuY3Rpb24gaW4gdGhlIGNvbnRleHQgb2YgZWFjaCBlbnRpdHksIHVzZSB0aGUgYC5lYWNoKClgIG1ldGhvZC5cbiAqXG4gKiBUaGUgZXZlbnQgcmVsYXRlZCBtZXRob2RzIHN1Y2ggYXMgYGJpbmRgIGFuZCBgdHJpZ2dlcmAgd2lsbCB3b3JrIG9uIHNlbGVjdGlvbnMgb2YgZW50aXRpZXMuXG4gKlxuICogQHNlZSAuZ2V0XG4gKiBAc2VlIC5lYWNoXG4gKi9cblxudmFyIENyYWZ0eSA9IGZ1bmN0aW9uIChzZWxlY3Rvcikge1xuICAgIHJldHVybiBuZXcgQ3JhZnR5LmZuLmluaXQoc2VsZWN0b3IpO1xufSxcbiAgICAvLyBJbnRlcm5hbCB2YXJpYWJsZXNcbiAgICBHVUlELCBmcmFtZSwgY29tcG9uZW50cywgZW50aXRpZXMsIGhhbmRsZXJzLCBvbmxvYWRzLFxuICAgIHNsaWNlLCBybGlzdCwgcnNwYWNlLCBtaWxsaVNlY1BlckZyYW1lO1xuXG5cbiAgICBpbml0U3RhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEdVSUQgPSAxLCAvL0dVSUQgZm9yIGVudGl0eSBJRHNcbiAgICAgICAgZnJhbWUgPSAwO1xuXG4gICAgICAgIGNvbXBvbmVudHMgPSB7fTsgLy9tYXAgb2YgY29tcG9uZW50cyBhbmQgdGhlaXIgZnVuY3Rpb25zXG4gICAgICAgIGVudGl0aWVzID0ge307IC8vbWFwIG9mIGVudGl0aWVzIGFuZCB0aGVpciBkYXRhXG4gICAgICAgIGhhbmRsZXJzID0ge307IC8vZ2xvYmFsIGV2ZW50IGhhbmRsZXJzXG4gICAgICAgIG9ubG9hZHMgPSBbXTsgLy90ZW1wb3Jhcnkgc3RvcmFnZSBvZiBvbmxvYWQgaGFuZGxlcnNcblxuICAgICAgICBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbiAgICAgICAgcmxpc3QgPSAvXFxzKixcXHMqLztcbiAgICAgICAgcnNwYWNlID0gL1xccysvO1xuICAgIH07XG5cbmluaXRTdGF0ZSgpO1xuXG4vKipAXG4gKiAjQ3JhZnR5IENvcmVcbiAqIEBjYXRlZ29yeSBDb3JlXG4gKiBAdHJpZ2dlciBOZXdFbnRpdHlOYW1lIC0gQWZ0ZXIgc2V0dGluZyBuZXcgbmFtZSBmb3IgZW50aXR5IC0gU3RyaW5nIC0gZW50aXR5IG5hbWVcbiAqIEB0cmlnZ2VyIE5ld0NvbXBvbmVudCAtIHdoZW4gYSBuZXcgY29tcG9uZW50IGlzIGFkZGVkIHRvIHRoZSBlbnRpdHkgLSBTdHJpbmcgLSBDb21wb25lbnRcbiAqIEB0cmlnZ2VyIFJlbW92ZUNvbXBvbmVudCAtIHdoZW4gYSBjb21wb25lbnQgaXMgcmVtb3ZlZCBmcm9tIHRoZSBlbnRpdHkgLSBTdHJpbmcgLSBDb21wb25lbnRcbiAqIEB0cmlnZ2VyIFJlbW92ZSAtIHdoZW4gdGhlIGVudGl0eSBpcyByZW1vdmVkIGJ5IGNhbGxpbmcgLmRlc3Ryb3koKVxuICpcbiAqIFNldCBvZiBtZXRob2RzIGFkZGVkIHRvIGV2ZXJ5IHNpbmdsZSBlbnRpdHkuXG4gKi9cbkNyYWZ0eS5mbiA9IENyYWZ0eS5wcm90b3R5cGUgPSB7XG5cbiAgICBpbml0OiBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgICAgICAgLy9zZWxlY3QgZW50aXRpZXMgYnkgY29tcG9uZW50XG4gICAgICAgIGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbGVtID0gMCwgLy9pbmRleCBlbGVtZW50c1xuICAgICAgICAgICAgICAgIGUsIC8vZW50aXR5IGZvckVhY2hcbiAgICAgICAgICAgICAgICBjdXJyZW50LFxuICAgICAgICAgICAgICAgIGFuZCA9IGZhbHNlLCAvL2ZsYWdzIGZvciBtdWx0aXBsZVxuICAgICAgICAgICAgICAgIG9yID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgZGVsLFxuICAgICAgICAgICAgICAgIGNvbXBzLFxuICAgICAgICAgICAgICAgIHNjb3JlLFxuICAgICAgICAgICAgICAgIGksIGw7XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3RvciA9PT0gJyonKSB7XG4gICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICAgICAgZm9yIChlIGluIGVudGl0aWVzKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGVudGl0aWVzIGlzIHNvbWV0aGluZyBsaWtlIHsyOmVudGl0eTIsIDM6ZW50aXR5MywgMTE6ZW50aXR5MTEsIC4uLn1cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZvci4uLmluIGxvb3Agc2V0cyBlIHRvIFwiMlwiLCBcIjNcIiwgXCIxMVwiLCAuLi4gaS5lLiBhbGxcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGVudGl0eSBJRCBudW1iZXJzLiBlIGlzIGEgc3RyaW5nLCBzbyArZSBjb252ZXJ0cyB0byBudW1iZXIgdHlwZS5cbiAgICAgICAgICAgICAgICAgICAgdGhpc1tpXSA9ICtlO1xuICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMubGVuZ3RoID0gaTtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGVyZSdzIG9ubHkgb25lIGVudGl0eSwgcmV0dXJuIHRoZSBhY3R1YWwgZW50aXR5XG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVudGl0aWVzW3RoaXNbMF1dO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9tdWx0aXBsZSBjb21wb25lbnRzIE9SXG4gICAgICAgICAgICBpZiAoc2VsZWN0b3IuaW5kZXhPZignLCcpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIG9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBkZWwgPSBybGlzdDtcbiAgICAgICAgICAgICAgICAvL2RlYWwgd2l0aCBtdWx0aXBsZSBjb21wb25lbnRzIEFORFxuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxlY3Rvci5pbmRleE9mKCcgJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgYW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBkZWwgPSByc3BhY2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vbG9vcCBvdmVyIGVudGl0aWVzXG4gICAgICAgICAgICBmb3IgKGUgaW4gZW50aXRpZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVudGl0aWVzLmhhc093blByb3BlcnR5KGUpKSBjb250aW51ZTsgLy9za2lwXG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGVudGl0aWVzW2VdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFuZCB8fCBvcikgeyAvL211bHRpcGxlIGNvbXBvbmVudHNcbiAgICAgICAgICAgICAgICAgICAgY29tcHMgPSBzZWxlY3Rvci5zcGxpdChkZWwpO1xuICAgICAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgICAgICAgICAgbCA9IGNvbXBzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgc2NvcmUgPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoOyBpIDwgbDsgaSsrKSAvL2xvb3Agb3ZlciBjb21wb25lbnRzXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5fX2NbY29tcHNbaV1dKSBzY29yZSsrOyAvL2lmIGNvbXBvbmVudCBleGlzdHMgYWRkIHRvIHNjb3JlXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgYW5kZWQgY29tcHMgYW5kIGhhcyBhbGwgT1Igb3JlZCBjb21wcyBhbmQgYXQgbGVhc3QgMVxuICAgICAgICAgICAgICAgICAgICBpZiAoYW5kICYmIHNjb3JlID09PSBsIHx8IG9yICYmIHNjb3JlID4gMCkgdGhpc1tlbGVtKytdID0gK2U7XG5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnQuX19jW3NlbGVjdG9yXSkgdGhpc1tlbGVtKytdID0gK2U7IC8vY29udmVydCB0byBpbnRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9leHRlbmQgYWxsIGNvbW1vbiBjb21wb25lbnRzXG4gICAgICAgICAgICBpZiAoZWxlbSA+IDAgJiYgIWFuZCAmJiAhb3IpIHRoaXMuZXh0ZW5kKGNvbXBvbmVudHNbc2VsZWN0b3JdKTtcbiAgICAgICAgICAgIGlmIChjb21wcyAmJiBhbmQpXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7IGkrKykgdGhpcy5leHRlbmQoY29tcG9uZW50c1tjb21wc1tpXV0pO1xuXG4gICAgICAgICAgICB0aGlzLmxlbmd0aCA9IGVsZW07IC8vbGVuZ3RoIGlzIHRoZSBsYXN0IGluZGV4IChhbHJlYWR5IGluY3JlbWVudGVkKVxuXG4gICAgICAgICAgICAvLyBpZiB0aGVyZSdzIG9ubHkgb25lIGVudGl0eSwgcmV0dXJuIHRoZSBhY3R1YWwgZW50aXR5XG4gICAgICAgICAgICBpZiAoZWxlbSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBlbnRpdGllc1t0aGlzW2VsZW0gLSAxXV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBlbHNlIHsgLy9TZWxlY3QgYSBzcGVjaWZpYyBlbnRpdHlcblxuICAgICAgICAgICAgaWYgKCFzZWxlY3RvcikgeyAvL25vdGhpbiBwYXNzZWQgY3JlYXRlcyBHb2QgZW50aXR5XG4gICAgICAgICAgICAgICAgc2VsZWN0b3IgPSAwO1xuICAgICAgICAgICAgICAgIGlmICghKHNlbGVjdG9yIGluIGVudGl0aWVzKSkgZW50aXRpZXNbc2VsZWN0b3JdID0gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9pZiBub3QgZXhpc3RzLCByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAgICAgICBpZiAoIShzZWxlY3RvciBpbiBlbnRpdGllcykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXNbMF0gPSBzZWxlY3RvcjtcbiAgICAgICAgICAgIHRoaXMubGVuZ3RoID0gMTtcblxuICAgICAgICAgICAgLy91cGRhdGUgZnJvbSB0aGUgY2FjaGVcbiAgICAgICAgICAgIGlmICghdGhpcy5fX2MpIHRoaXMuX19jID0ge307XG5cbiAgICAgICAgICAgIC8vdXBkYXRlIHRvIHRoZSBjYWNoZSBpZiBOVUxMXG4gICAgICAgICAgICBpZiAoIWVudGl0aWVzW3NlbGVjdG9yXSkgZW50aXRpZXNbc2VsZWN0b3JdID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiBlbnRpdGllc1tzZWxlY3Rvcl07IC8vcmV0dXJuIHRoZSBjYWNoZWQgc2VsZWN0b3JcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5zZXROYW1lXG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuc2V0TmFtZShTdHJpbmcgbmFtZSlcbiAgICAgKiBAcGFyYW0gbmFtZSAtIEEgaHVtYW4gcmVhZGFibGUgbmFtZSBmb3IgZGVidWdnaW5nIHB1cnBvc2VzLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB0aGlzLnNldE5hbWUoXCJQbGF5ZXJcIik7XG4gICAgICogfn5+XG4gICAgICovXG4gICAgc2V0TmFtZTogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgdmFyIGVudGl0eU5hbWUgPSBTdHJpbmcobmFtZSk7XG5cbiAgICAgICAgdGhpcy5fZW50aXR5TmFtZSA9IGVudGl0eU5hbWU7XG5cbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiTmV3RW50aXR5TmFtZVwiLCBlbnRpdHlOYW1lKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmFkZENvbXBvbmVudFxuICAgICAqIEBjb21wIENyYWZ0eSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmFkZENvbXBvbmVudChTdHJpbmcgY29tcG9uZW50TGlzdClcbiAgICAgKiBAcGFyYW0gY29tcG9uZW50TGlzdCAtIEEgc3RyaW5nIG9mIGNvbXBvbmVudHMgdG8gYWRkIHNlcGFyYXRlZCBieSBhIGNvbW1hIGAsYFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5hZGRDb21wb25lbnQoU3RyaW5nIENvbXBvbmVudDFbLCAuLiwgU3RyaW5nIENvbXBvbmVudE5dKVxuICAgICAqIEBwYXJhbSBDb21wb25lbnQjIC0gQ29tcG9uZW50IElEIHRvIGFkZC5cbiAgICAgKiBBZGRzIGEgY29tcG9uZW50IHRvIHRoZSBzZWxlY3RlZCBlbnRpdGllcyBvciBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBDb21wb25lbnRzIGFyZSB1c2VkIHRvIGV4dGVuZCB0aGUgZnVuY3Rpb25hbGl0eSBvZiBlbnRpdGllcy5cbiAgICAgKiBUaGlzIG1lYW5zIGl0IHdpbGwgY29weSBwcm9wZXJ0aWVzIGFuZCBhc3NpZ24gbWV0aG9kcyB0b1xuICAgICAqIGF1Z21lbnQgdGhlIGZ1bmN0aW9uYWxpdHkgb2YgdGhlIGVudGl0eS5cbiAgICAgKlxuICAgICAqIEZvciBhZGRpbmcgbXVsdGlwbGUgY29tcG9uZW50cywgeW91IGNhbiBlaXRoZXIgcGFzcyBhIHN0cmluZyB3aXRoXG4gICAgICogYWxsIHRoZSBjb21wb25lbnQgbmFtZXMgKHNlcGFyYXRlZCBieSBjb21tYXMpLCBvciBwYXNzIGVhY2ggY29tcG9uZW50IG5hbWUgYXNcbiAgICAgKiBhbiBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIElmIHRoZSBjb21wb25lbnQgaGFzIGEgZnVuY3Rpb24gbmFtZWQgYGluaXRgIGl0IHdpbGwgYmUgY2FsbGVkLlxuICAgICAqXG4gICAgICogSWYgdGhlIGVudGl0eSBhbHJlYWR5IGhhcyB0aGUgY29tcG9uZW50LCB0aGUgY29tcG9uZW50IGlzIHNraXBwZWQgKG5vdGhpbmcgaGFwcGVucykuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHRoaXMuYWRkQ29tcG9uZW50KFwiMkQsIENhbnZhc1wiKTtcbiAgICAgKiB0aGlzLmFkZENvbXBvbmVudChcIjJEXCIsIFwiQ2FudmFzXCIpO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIGFkZENvbXBvbmVudDogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgIHZhciB1bmluaXQgPSBbXSxcbiAgICAgICAgICAgIGMgPSAwLFxuICAgICAgICAgICAgdWwsIC8vYXJyYXkgb2YgY29tcG9uZW50cyB0byBpbml0XG4gICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgIGwsIGNvbXBzLCBjb21wO1xuXG4gICAgICAgIC8vYWRkIG11bHRpcGxlIGFyZ3VtZW50c1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIGwgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICB1bmluaXQucHVzaChhcmd1bWVudHNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9zcGxpdCBjb21wb25lbnRzIGlmIGNvbnRhaW5zIGNvbW1hXG4gICAgICAgIH0gZWxzZSBpZiAoaWQuaW5kZXhPZignLCcpICE9PSAtMSkge1xuICAgICAgICAgICAgY29tcHMgPSBpZC5zcGxpdChybGlzdCk7XG4gICAgICAgICAgICBsID0gY29tcHMubGVuZ3RoO1xuICAgICAgICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICB1bmluaXQucHVzaChjb21wc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL3NpbmdsZSBjb21wb25lbnQgcGFzc2VkXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1bmluaXQucHVzaChpZCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2V4dGVuZCB0aGUgY29tcG9uZW50c1xuICAgICAgICB1bCA9IHVuaW5pdC5sZW5ndGg7XG4gICAgICAgIGZvciAoOyBjIDwgdWw7IGMrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMuX19jW3VuaW5pdFtjXV0gPT09IHRydWUpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB0aGlzLl9fY1t1bmluaXRbY11dID0gdHJ1ZTtcbiAgICAgICAgICAgIGNvbXAgPSBjb21wb25lbnRzW3VuaW5pdFtjXV07XG4gICAgICAgICAgICB0aGlzLmV4dGVuZChjb21wKTtcbiAgICAgICAgICAgIC8vaWYgY29uc3RydWN0b3IsIGNhbGwgaXRcbiAgICAgICAgICAgIGlmIChjb21wICYmIFwiaW5pdFwiIGluIGNvbXApIHtcbiAgICAgICAgICAgICAgICBjb21wLmluaXQuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudHJpZ2dlcihcIk5ld0NvbXBvbmVudFwiLCB1bmluaXQpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMudG9nZ2xlQ29tcG9uZW50XG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAudG9nZ2xlQ29tcG9uZW50KFN0cmluZyBDb21wb25lbnRMaXN0KVxuICAgICAqIEBwYXJhbSBDb21wb25lbnRMaXN0IC0gQSBzdHJpbmcgb2YgY29tcG9uZW50cyB0byBhZGQgb3IgcmVtb3ZlIHNlcGFyYXRlZCBieSBhIGNvbW1hIGAsYFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC50b2dnbGVDb21wb25lbnQoU3RyaW5nIENvbXBvbmVudDFbLCAuLiwgU3RyaW5nIGNvbXBvbmVudE5dKVxuICAgICAqIEBwYXJhbSBDb21wb25lbnQjIC0gQ29tcG9uZW50IElEIHRvIGFkZCBvciByZW1vdmUuXG4gICAgICogQWRkIG9yIFJlbW92ZSBDb21wb25lbnRzIGZyb20gYW4gZW50aXR5LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgZSA9IENyYWZ0eS5lKFwiMkQsRE9NLFRlc3RcIik7XG4gICAgICogZS50b2dnbGVDb21wb25lbnQoXCJUZXN0LFRlc3QyXCIpOyAvL1JlbW92ZSBUZXN0LCBhZGQgVGVzdDJcbiAgICAgKiBlLnRvZ2dsZUNvbXBvbmVudChcIlRlc3QsVGVzdDJcIik7IC8vQWRkIFRlc3QsIHJlbW92ZSBUZXN0MlxuICAgICAqIH5+flxuICAgICAqXG4gICAgICogfn5+XG4gICAgICogdmFyIGUgPSBDcmFmdHkuZShcIjJELERPTSxUZXN0XCIpO1xuICAgICAqIGUudG9nZ2xlQ29tcG9uZW50KFwiVGVzdFwiLFwiVGVzdDJcIik7IC8vUmVtb3ZlIFRlc3QsIGFkZCBUZXN0MlxuICAgICAqIGUudG9nZ2xlQ29tcG9uZW50KFwiVGVzdFwiLFwiVGVzdDJcIik7IC8vQWRkIFRlc3QsIHJlbW92ZSBUZXN0MlxuICAgICAqIGUudG9nZ2xlQ29tcG9uZW50KFwiVGVzdFwiKTsgICAgICAgICAvL1JlbW92ZSBUZXN0XG4gICAgICogfn5+XG4gICAgICovXG4gICAgdG9nZ2xlQ29tcG9uZW50OiBmdW5jdGlvbiAodG9nZ2xlKSB7XG4gICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgIGwsIGNvbXBzO1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIGwgPSBhcmd1bWVudHMubGVuZ3RoO1xuXG4gICAgICAgICAgICBmb3IgKDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmhhcyhhcmd1bWVudHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQ29tcG9uZW50KGFyZ3VtZW50c1tpXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRDb21wb25lbnQoYXJndW1lbnRzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL3NwbGl0IGNvbXBvbmVudHMgaWYgY29udGFpbnMgY29tbWFcbiAgICAgICAgfSBlbHNlIGlmICh0b2dnbGUuaW5kZXhPZignLCcpICE9PSAtMSkge1xuICAgICAgICAgICAgY29tcHMgPSB0b2dnbGUuc3BsaXQocmxpc3QpO1xuICAgICAgICAgICAgbCA9IGNvbXBzLmxlbmd0aDtcbiAgICAgICAgICAgIGZvciAoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaGFzKGNvbXBzW2ldKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUNvbXBvbmVudChjb21wc1tpXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRDb21wb25lbnQoY29tcHNbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9zaW5nbGUgY29tcG9uZW50IHBhc3NlZFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuaGFzKHRvZ2dsZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUNvbXBvbmVudCh0b2dnbGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZENvbXBvbmVudCh0b2dnbGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLnJlcXVpcmVzXG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAucmVxdWlyZXMoU3RyaW5nIGNvbXBvbmVudExpc3QpXG4gICAgICogQHBhcmFtIGNvbXBvbmVudExpc3QgLSBMaXN0IG9mIGNvbXBvbmVudHMgdGhhdCBtdXN0IGJlIGFkZGVkXG4gICAgICpcbiAgICAgKiBNYWtlcyBzdXJlIHRoZSBlbnRpdHkgaGFzIHRoZSBjb21wb25lbnRzIGxpc3RlZC4gSWYgdGhlIGVudGl0eSBkb2VzIG5vdFxuICAgICAqIGhhdmUgdGhlIGNvbXBvbmVudCwgaXQgd2lsbCBhZGQgaXQuXG4gICAgICpcbiAgICAgKiAoSW4gdGhlIGN1cnJlbnQgdmVyc2lvbiBvZiBDcmFmdHksIHRoaXMgZnVuY3Rpb24gYmVoYXZlcyBleGFjdGx5IHRoZSBzYW1lXG4gICAgICogYXMgYGFkZENvbXBvbmVudGAuIEJ5IGNvbnZlbnRpb24sIGRldmVsb3BlcnMgaGF2ZSB1c2VkIGByZXF1aXJlc2AgZm9yXG4gICAgICogY29tcG9uZW50IGRlcGVuZGVuY2llcyAtLSBpLmUuIHRvIGluZGljYXRlIHNwZWNpZmljYWxseSB0aGF0IG9uZSBjb21wb25lbnRcbiAgICAgKiB3aWxsIG9ubHkgd29yayBwcm9wZXJseSBpZiBhbm90aGVyIGNvbXBvbmVudCBpcyBwcmVzZW50IC0tIGFuZCB1c2VkXG4gICAgICogYGFkZENvbXBvbmVudGAgaW4gYWxsIG90aGVyIHNpdHVhdGlvbnMuKVxuICAgICAqXG4gICAgICogQHNlZSAuYWRkQ29tcG9uZW50XG4gICAgICovXG4gICAgcmVxdWlyZXM6IGZ1bmN0aW9uIChsaXN0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFkZENvbXBvbmVudChsaXN0KTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMucmVtb3ZlQ29tcG9uZW50XG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAucmVtb3ZlQ29tcG9uZW50KFN0cmluZyBDb21wb25lbnRbLCBzb2Z0XSlcbiAgICAgKiBAcGFyYW0gY29tcG9uZW50IC0gQ29tcG9uZW50IHRvIHJlbW92ZVxuICAgICAqIEBwYXJhbSBzb2Z0IC0gV2hldGhlciB0byBzb2Z0IHJlbW92ZSBpdCAoZGVmYXVsdHMgdG8gYHRydWVgKVxuICAgICAqXG4gICAgICogUmVtb3ZlcyBhIGNvbXBvbmVudCBmcm9tIGFuIGVudGl0eS4gQSBzb2Z0IHJlbW92ZSAodGhlIGRlZmF1bHQpIHdpbGwgb25seVxuICAgICAqIHJlZnJhaW4gYC5oYXMoKWAgZnJvbSByZXR1cm5pbmcgdHJ1ZS4gSGFyZCB3aWxsIHJlbW92ZSBhbGxcbiAgICAgKiBhc3NvY2lhdGVkIHByb3BlcnRpZXMgYW5kIG1ldGhvZHMuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHZhciBlID0gQ3JhZnR5LmUoXCIyRCxET00sVGVzdFwiKTtcbiAgICAgKiBlLnJlbW92ZUNvbXBvbmVudChcIlRlc3RcIik7ICAgICAgICAvL1NvZnQgcmVtb3ZlIFRlc3QgY29tcG9uZW50XG4gICAgICogZS5yZW1vdmVDb21wb25lbnQoXCJUZXN0XCIsIGZhbHNlKTsgLy9IYXJkIHJlbW92ZSBUZXN0IGNvbXBvbmVudFxuICAgICAqIH5+flxuICAgICAqL1xuICAgIHJlbW92ZUNvbXBvbmVudDogZnVuY3Rpb24gKGlkLCBzb2Z0KSB7XG4gICAgICAgIHZhciBjb21wID0gY29tcG9uZW50c1tpZF07XG4gICAgICAgIHRoaXMudHJpZ2dlcihcIlJlbW92ZUNvbXBvbmVudFwiLCBpZCk7XG4gICAgICAgIGlmIChjb21wICYmIFwicmVtb3ZlXCIgaW4gY29tcCkge1xuICAgICAgICAgICAgY29tcC5yZW1vdmUuY2FsbCh0aGlzLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNvZnQgPT09IGZhbHNlICYmIGNvbXApIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gY29tcCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9fY1tpZF07XG5cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuZ2V0SWRcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgLmdldElkKHZvaWQpXG4gICAgICogUmV0dXJucyB0aGUgSUQgb2YgdGhpcyBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBGb3IgYmV0dGVyIHBlcmZvcm1hbmNlLCBzaW1wbHkgdXNlIHRoZSB0aGlzWzBdIHByb3BlcnR5LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBGaW5kaW5nIG91dCB0aGUgYElEYCBvZiBhbiBlbnRpdHkgY2FuIGJlIGRvbmUgYnkgcmV0dXJuaW5nIHRoZSBwcm9wZXJ0eSBgMGAuXG4gICAgICogfn5+XG4gICAgICogICAgdmFyIGVudCA9IENyYWZ0eS5lKFwiMkRcIik7XG4gICAgICogICAgZW50WzBdOyAvL0lEXG4gICAgICogICAgZW50LmdldElkKCk7IC8vYWxzbyBJRFxuICAgICAqIH5+flxuICAgICAqL1xuICAgIGdldElkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzWzBdO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5oYXNcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIC5oYXMoU3RyaW5nIGNvbXBvbmVudClcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBvciBgZmFsc2VgIGRlcGVuZGluZyBvbiBpZiB0aGVcbiAgICAgKiBlbnRpdHkgaGFzIHRoZSBnaXZlbiBjb21wb25lbnQuXG4gICAgICpcbiAgICAgKiBGb3IgYmV0dGVyIHBlcmZvcm1hbmNlLCBzaW1wbHkgdXNlIHRoZSBgLl9fY2Agb2JqZWN0XG4gICAgICogd2hpY2ggd2lsbCBiZSBgdHJ1ZWAgaWYgdGhlIGVudGl0eSBoYXMgdGhlIGNvbXBvbmVudCBvclxuICAgICAqIHdpbGwgbm90IGV4aXN0IChvciBiZSBgZmFsc2VgKS5cbiAgICAgKi9cbiAgICBoYXM6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9fY1tpZF07XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmF0dHJcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5hdHRyKFN0cmluZyBwcm9wZXJ0eSwgKiB2YWx1ZSlcbiAgICAgKiBAcGFyYW0gcHJvcGVydHkgLSBQcm9wZXJ0eSBvZiB0aGUgZW50aXR5IHRvIG1vZGlmeVxuICAgICAqIEBwYXJhbSB2YWx1ZSAtIFZhbHVlIHRvIHNldCB0aGUgcHJvcGVydHkgdG9cbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuYXR0cihPYmplY3QgbWFwKVxuICAgICAqIEBwYXJhbSBtYXAgLSBPYmplY3Qgd2hlcmUgdGhlIGtleSBpcyB0aGUgcHJvcGVydHkgdG8gbW9kaWZ5IGFuZCB0aGUgdmFsdWUgYXMgdGhlIHByb3BlcnR5IHZhbHVlXG4gICAgICogQHRyaWdnZXIgQ2hhbmdlIC0gd2hlbiBwcm9wZXJ0aWVzIGNoYW5nZSAtIHtrZXk6IHZhbHVlfVxuICAgICAqXG4gICAgICogVXNlIHRoaXMgbWV0aG9kIHRvIHNldCBhbnkgcHJvcGVydHkgb2YgdGhlIGVudGl0eS5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogdGhpcy5hdHRyKHtrZXk6IFwidmFsdWVcIiwgcHJvcDogNX0pO1xuICAgICAqIHRoaXMua2V5OyAvL3ZhbHVlXG4gICAgICogdGhpcy5wcm9wOyAvLzVcbiAgICAgKlxuICAgICAqIHRoaXMuYXR0cihcImtleVwiLCBcIm5ld3ZhbHVlXCIpO1xuICAgICAqIHRoaXMua2V5OyAvL25ld3ZhbHVlXG4gICAgICogfn5+XG4gICAgICovXG4gICAgYXR0cjogZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIC8vaWYganVzdCB0aGUga2V5LCByZXR1cm4gdGhlIHZhbHVlXG4gICAgICAgICAgICBpZiAodHlwZW9mIGtleSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW2tleV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vZXh0ZW5kIGlmIG9iamVjdFxuICAgICAgICAgICAgdGhpcy5leHRlbmQoa2V5KTtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIkNoYW5nZVwiLCBrZXkpOyAvL3RyaWdnZXIgY2hhbmdlIGV2ZW50XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgICAvL2lmIGtleSB2YWx1ZSBwYWlyXG4gICAgICAgIHRoaXNba2V5XSA9IHZhbHVlO1xuXG4gICAgICAgIHZhciBjaGFuZ2UgPSB7fTtcbiAgICAgICAgY2hhbmdlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiQ2hhbmdlXCIsIGNoYW5nZSk7IC8vdHJpZ2dlciBjaGFuZ2UgZXZlbnRcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLnRvQXJyYXlcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC50b0FycmF5KHZvaWQpXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCB3aWxsIHNpbXBseSByZXR1cm4gdGhlIGZvdW5kIGVudGl0aWVzIGFzIGFuIGFycmF5IG9mIGlkcy4gIFRvIGdldCBhbiBhcnJheSBvZiB0aGUgYWN0dWFsIGVudGl0aWVzLCB1c2UgYGdldCgpYC5cbiAgICAgKiBAc2VlIC5nZXRcbiAgICAgKi9cbiAgICB0b0FycmF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzbGljZS5jYWxsKHRoaXMsIDApO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgKiAjLnRpbWVvdXRcbiAgICAqIEBjb21wIENyYWZ0eSBDb3JlXG4gICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAudGltZW91dChGdW5jdGlvbiBjYWxsYmFjaywgTnVtYmVyIGRlbGF5KVxuICAgICogQHBhcmFtIGNhbGxiYWNrIC0gTWV0aG9kIHRvIGV4ZWN1dGUgYWZ0ZXIgZ2l2ZW4gYW1vdW50IG9mIG1pbGxpc2Vjb25kc1xuICAgICogQHBhcmFtIGRlbGF5IC0gQW1vdW50IG9mIG1pbGxpc2Vjb25kcyB0byBleGVjdXRlIHRoZSBtZXRob2RcbiAgICAqXG4gICAgKiBUaGUgZGVsYXkgbWV0aG9kIHdpbGwgZXhlY3V0ZSBhIGZ1bmN0aW9uIGFmdGVyIGEgZ2l2ZW4gYW1vdW50IG9mIHRpbWUgaW4gbWlsbGlzZWNvbmRzLlxuICAgICpcbiAgICAqIEVzc2VudGlhbGx5IGEgd3JhcHBlciBmb3IgYHNldFRpbWVvdXRgLlxuICAgICpcbiAgICAqIEBleGFtcGxlXG4gICAgKiBEZXN0cm95IGl0c2VsZiBhZnRlciAxMDAgbWlsbGlzZWNvbmRzXG4gICAgKiB+fn5cbiAgICAqIHRoaXMudGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgIHRoaXMuZGVzdHJveSgpO1xuICAgICogfSwgMTAwKTtcbiAgICAqIH5+flxuICAgICovXG4gICAgdGltZW91dDogZnVuY3Rpb24gKGNhbGxiYWNrLCBkdXJhdGlvbikge1xuICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChzZWxmKTtcbiAgICAgICAgICAgIH0sIGR1cmF0aW9uKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5iaW5kXG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuYmluZChTdHJpbmcgZXZlbnROYW1lLCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gYmluZCB0b1xuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIE1ldGhvZCB0byBleGVjdXRlIHdoZW4gdGhlIGV2ZW50IGlzIHRyaWdnZXJlZFxuICAgICAqIEF0dGFjaCB0aGUgY3VycmVudCBlbnRpdHkgKG9yIGVudGl0aWVzKSB0byBsaXN0ZW4gZm9yIGFuIGV2ZW50LlxuICAgICAqXG4gICAgICogQ2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gYW4gZXZlbnQgd2l0aCB0aGUgZXZlbnQgbmFtZSBwYXNzZWRcbiAgICAgKiBpcyB0cmlnZ2VyZWQuIERlcGVuZGluZyBvbiB0aGUgZXZlbnQsIHNvbWUgZGF0YSBtYXkgYmUgcGFzc2VkXG4gICAgICogdmlhIGFuIGFyZ3VtZW50IHRvIHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIFRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgZXZlbnQgbmFtZSAoY2FuIGJlIGFueXRoaW5nKSB3aGlsc3QgdGhlXG4gICAgICogc2Vjb25kIGFyZ3VtZW50IGlzIHRoZSBjYWxsYmFjay4gSWYgdGhlIGV2ZW50IGhhcyBkYXRhLCB0aGVcbiAgICAgKiBjYWxsYmFjayBzaG91bGQgaGF2ZSBhbiBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIEV2ZW50cyBhcmUgYXJiaXRyYXJ5IGFuZCBwcm92aWRlIGNvbW11bmljYXRpb24gYmV0d2VlbiBjb21wb25lbnRzLlxuICAgICAqIFlvdSBjYW4gdHJpZ2dlciBvciBiaW5kIGFuIGV2ZW50IGV2ZW4gaWYgaXQgZG9lc24ndCBleGlzdCB5ZXQuXG4gICAgICpcbiAgICAgKiBVbmxpa2UgRE9NIGV2ZW50cywgQ3JhZnR5IGV2ZW50cyBhcmUgZXhlY3R1ZWQgc3luY2hyb25vdXNseS5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogdGhpcy5hdHRyKFwidHJpZ2dlcnNcIiwgMCk7IC8vc2V0IGEgdHJpZ2dlciBjb3VudFxuICAgICAqIHRoaXMuYmluZChcIm15ZXZlbnRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICogICAgIHRoaXMudHJpZ2dlcnMrKzsgLy93aGVuZXZlciBteWV2ZW50IGlzIHRyaWdnZXJlZCwgaW5jcmVtZW50XG4gICAgICogfSk7XG4gICAgICogdGhpcy5iaW5kKFwiRW50ZXJGcmFtZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgKiAgICAgdGhpcy50cmlnZ2VyKFwibXlldmVudFwiKTsgLy90cmlnZ2VyIG15ZXZlbnQgb24gZXZlcnkgZnJhbWVcbiAgICAgKiB9KTtcbiAgICAgKiB+fn5cbiAgICAgKlxuICAgICAqIEBzZWUgLnRyaWdnZXIsIC51bmJpbmRcbiAgICAgKi9cbiAgICBiaW5kOiBmdW5jdGlvbiAoZXZlbnQsIGNhbGxiYWNrKSB7XG5cbiAgICAgICAgLy8gKFRvIGxlYXJuIGhvdyB0aGUgaGFuZGxlcnMgb2JqZWN0IHdvcmtzLCBzZWUgaW5saW5lIGNvbW1lbnQgYXQgQ3JhZnR5LmJpbmQpXG5cbiAgICAgICAgLy9vcHRpbWl6YXRpb24gZm9yIDEgZW50aXR5XG4gICAgICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKCFoYW5kbGVyc1tldmVudF0pIGhhbmRsZXJzW2V2ZW50XSA9IHt9O1xuICAgICAgICAgICAgdmFyIGggPSBoYW5kbGVyc1tldmVudF07XG5cbiAgICAgICAgICAgIGlmICghaFt0aGlzWzBdXSkgaFt0aGlzWzBdXSA9IFtdOyAvL2luaXQgaGFuZGxlciBhcnJheSBmb3IgZW50aXR5XG4gICAgICAgICAgICBoW3RoaXNbMF1dLnB1c2goY2FsbGJhY2spOyAvL2FkZCBjdXJyZW50IGNhbGxiYWNrXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvL2luaXQgZXZlbnQgY29sbGVjdGlvblxuICAgICAgICAgICAgaWYgKCFoYW5kbGVyc1tldmVudF0pIGhhbmRsZXJzW2V2ZW50XSA9IHt9O1xuICAgICAgICAgICAgdmFyIGggPSBoYW5kbGVyc1tldmVudF07XG5cbiAgICAgICAgICAgIGlmICghaFt0aGlzWzBdXSkgaFt0aGlzWzBdXSA9IFtdOyAvL2luaXQgaGFuZGxlciBhcnJheSBmb3IgZW50aXR5XG4gICAgICAgICAgICBoW3RoaXNbMF1dLnB1c2goY2FsbGJhY2spOyAvL2FkZCBjdXJyZW50IGNhbGxiYWNrXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMudW5pcXVlQmluZFxuICAgICAqIEBjb21wIENyYWZ0eSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIE51bWJlciAudW5pcXVlQmluZChTdHJpbmcgZXZlbnROYW1lLCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gYmluZCB0b1xuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIE1ldGhvZCB0byBleGVjdXRlIHVwb24gZXZlbnQgdHJpZ2dlcmVkXG4gICAgICogQHJldHVybnMgSUQgb2YgdGhlIGN1cnJlbnQgY2FsbGJhY2sgdXNlZCB0byB1bmJpbmRcbiAgICAgKlxuICAgICAqIFdvcmtzIGxpa2UgQ3JhZnR5LmJpbmQsIGJ1dCBwcmV2ZW50cyBhIGNhbGxiYWNrIGZyb20gYmVpbmcgYm91bmQgbXVsdGlwbGUgdGltZXMuXG4gICAgICpcbiAgICAgKiBAc2VlIC5iaW5kXG4gICAgICovXG4gICAgdW5pcXVlQmluZDogZnVuY3Rpb24gKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLnVuYmluZChldmVudCwgY2FsbGJhY2spO1xuICAgICAgICB0aGlzLmJpbmQoZXZlbnQsIGNhbGxiYWNrKTtcblxuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5vbmVcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgb25lKFN0cmluZyBldmVudE5hbWUsIEZ1bmN0aW9uIGNhbGxiYWNrKVxuICAgICAqIEBwYXJhbSBldmVudE5hbWUgLSBOYW1lIG9mIHRoZSBldmVudCB0byBiaW5kIHRvXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gTWV0aG9kIHRvIGV4ZWN1dGUgdXBvbiBldmVudCB0cmlnZ2VyZWRcbiAgICAgKiBAcmV0dXJucyBJRCBvZiB0aGUgY3VycmVudCBjYWxsYmFjayB1c2VkIHRvIHVuYmluZFxuICAgICAqXG4gICAgICogV29ya3MgbGlrZSBDcmFmdHkuYmluZCwgYnV0IHdpbGwgYmUgdW5ib3VuZCBvbmNlIHRoZSBldmVudCB0cmlnZ2Vycy5cbiAgICAgKlxuICAgICAqIEBzZWUgLmJpbmRcbiAgICAgKi9cbiAgICBvbmU6IGZ1bmN0aW9uIChldmVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgb25lSGFuZGxlciA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICBjYWxsYmFjay5jYWxsKHNlbGYsIGRhdGEpO1xuICAgICAgICAgICAgc2VsZi51bmJpbmQoZXZlbnQsIG9uZUhhbmRsZXIpO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gc2VsZi5iaW5kKGV2ZW50LCBvbmVIYW5kbGVyKTtcblxuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy51bmJpbmRcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC51bmJpbmQoU3RyaW5nIGV2ZW50TmFtZVssIEZ1bmN0aW9uIGNhbGxiYWNrXSlcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gdW5iaW5kXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gRnVuY3Rpb24gdG8gdW5iaW5kXG4gICAgICogUmVtb3ZlcyBiaW5kaW5nIHdpdGggYW4gZXZlbnQgZnJvbSBjdXJyZW50IGVudGl0eS5cbiAgICAgKlxuICAgICAqIFBhc3NpbmcgYW4gZXZlbnQgbmFtZSB3aWxsIHJlbW92ZSBhbGwgZXZlbnRzIGJvdW5kIHRvXG4gICAgICogdGhhdCBldmVudC4gUGFzc2luZyBhIHJlZmVyZW5jZSB0byB0aGUgY2FsbGJhY2sgd2lsbFxuICAgICAqIHVuYmluZCBvbmx5IHRoYXQgY2FsbGJhY2suXG4gICAgICogQHNlZSAuYmluZCwgLnRyaWdnZXJcbiAgICAgKi9cbiAgICB1bmJpbmQ6IGZ1bmN0aW9uIChldmVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgLy8gKFRvIGxlYXJuIGhvdyB0aGUgaGFuZGxlcnMgb2JqZWN0IHdvcmtzLCBzZWUgaW5saW5lIGNvbW1lbnQgYXQgQ3JhZnR5LmJpbmQpXG4gICAgICAgIHRoaXMuZWFjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgaGRsID0gaGFuZGxlcnNbZXZlbnRdLFxuICAgICAgICAgICAgICAgIGkgPSAwLFxuICAgICAgICAgICAgICAgIGwsIGN1cnJlbnQ7XG4gICAgICAgICAgICAvL2lmIG5vIGV2ZW50cywgY2FuY2VsXG4gICAgICAgICAgICBpZiAoaGRsICYmIGhkbFt0aGlzWzBdXSkgbCA9IGhkbFt0aGlzWzBdXS5sZW5ndGg7XG4gICAgICAgICAgICBlbHNlIHJldHVybiB0aGlzO1xuXG4gICAgICAgICAgICAvL2lmIG5vIGZ1bmN0aW9uLCBkZWxldGUgYWxsXG4gICAgICAgICAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGhkbFt0aGlzWzBdXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vbG9vayBmb3IgYSBtYXRjaCBpZiB0aGUgZnVuY3Rpb24gaXMgcGFzc2VkXG4gICAgICAgICAgICBmb3IgKDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBoZGxbdGhpc1swXV07XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRbaV0gPT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnRbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMudHJpZ2dlclxuICAgICAqIEBjb21wIENyYWZ0eSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnRyaWdnZXIoU3RyaW5nIGV2ZW50TmFtZVssIE9iamVjdCBkYXRhXSlcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gRXZlbnQgdG8gdHJpZ2dlclxuICAgICAqIEBwYXJhbSBkYXRhIC0gQXJiaXRyYXJ5IGRhdGEgdGhhdCB3aWxsIGJlIHBhc3NlZCBpbnRvIGV2ZXJ5IGNhbGxiYWNrIGFzIGFuIGFyZ3VtZW50XG4gICAgICogVHJpZ2dlciBhbiBldmVudCB3aXRoIGFyYml0cmFyeSBkYXRhLiBXaWxsIGludm9rZSBhbGwgY2FsbGJhY2tzIHdpdGhcbiAgICAgKiB0aGUgY29udGV4dCAodmFsdWUgb2YgYHRoaXNgKSBvZiB0aGUgY3VycmVudCBlbnRpdHkgb2JqZWN0LlxuICAgICAqXG4gICAgICogKk5vdGU6IFRoaXMgd2lsbCBvbmx5IGV4ZWN1dGUgY2FsbGJhY2tzIHdpdGhpbiB0aGUgY3VycmVudCBlbnRpdHksIG5vIG90aGVyIGVudGl0eS4qXG4gICAgICpcbiAgICAgKiBUaGUgZmlyc3QgYXJndW1lbnQgaXMgdGhlIGV2ZW50IG5hbWUgdG8gdHJpZ2dlciBhbmQgdGhlIG9wdGlvbmFsXG4gICAgICogc2Vjb25kIGFyZ3VtZW50IGlzIHRoZSBhcmJpdHJhcnkgZXZlbnQgZGF0YS4gVGhpcyBjYW4gYmUgYWJzb2x1dGVseSBhbnl0aGluZy5cbiAgICAgKlxuICAgICAqIFVubGlrZSBET00gZXZlbnRzLCBDcmFmdHkgZXZlbnRzIGFyZSBleGVjdHVlZCBzeW5jaHJvbm91c2x5LlxuICAgICAqL1xuICAgIHRyaWdnZXI6IGZ1bmN0aW9uIChldmVudCwgZGF0YSkge1xuICAgICAgICAvLyAoVG8gbGVhcm4gaG93IHRoZSBoYW5kbGVycyBvYmplY3Qgd29ya3MsIHNlZSBpbmxpbmUgY29tbWVudCBhdCBDcmFmdHkuYmluZClcbiAgICAgICAgaWYgKHRoaXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAvL2ZpbmQgdGhlIGhhbmRsZXJzIGFzc2lnbmVkIHRvIHRoZSBldmVudCBhbmQgZW50aXR5XG4gICAgICAgICAgICBpZiAoaGFuZGxlcnNbZXZlbnRdICYmIGhhbmRsZXJzW2V2ZW50XVt0aGlzWzBdXSkge1xuICAgICAgICAgICAgICAgIHZhciBjYWxsYmFja3MgPSBoYW5kbGVyc1tldmVudF1bdGhpc1swXV0sXG4gICAgICAgICAgICAgICAgICAgIGk7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrc1tpXSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGktLTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrc1tpXS5jYWxsKHRoaXMsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmVhY2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy9maW5kIHRoZSBoYW5kbGVycyBhc3NpZ25lZCB0byB0aGUgZXZlbnQgYW5kIGVudGl0eVxuICAgICAgICAgICAgaWYgKGhhbmRsZXJzW2V2ZW50XSAmJiBoYW5kbGVyc1tldmVudF1bdGhpc1swXV0pIHtcbiAgICAgICAgICAgICAgICB2YXIgY2FsbGJhY2tzID0gaGFuZGxlcnNbZXZlbnRdW3RoaXNbMF1dLFxuICAgICAgICAgICAgICAgICAgICBpO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFja3NbaV0gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFja3NbaV0uY2FsbCh0aGlzLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5lYWNoXG4gICAgICogQGNvbXAgQ3JhZnR5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuZWFjaChGdW5jdGlvbiBtZXRob2QpXG4gICAgICogQHBhcmFtIG1ldGhvZCAtIE1ldGhvZCB0byBjYWxsIG9uIGVhY2ggaXRlcmF0aW9uXG4gICAgICogSXRlcmF0ZXMgb3ZlciBmb3VuZCBlbnRpdGllcywgY2FsbGluZyBhIGZ1bmN0aW9uIGZvciBldmVyeSBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBUaGUgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgZm9yIGV2ZXJ5IGVudGl0eSBhbmQgd2lsbCBwYXNzIHRoZSBpbmRleFxuICAgICAqIGluIHRoZSBpdGVyYXRpb24gYXMgYW4gYXJndW1lbnQuIFRoZSBjb250ZXh0ICh2YWx1ZSBvZiBgdGhpc2ApIG9mIHRoZVxuICAgICAqIGZ1bmN0aW9uIHdpbGwgYmUgdGhlIGN1cnJlbnQgZW50aXR5IGluIHRoZSBpdGVyYXRpb24uXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIERlc3Ryb3kgZXZlcnkgc2Vjb25kIDJEIGVudGl0eVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eShcIjJEXCIpLmVhY2goZnVuY3Rpb24oaSkge1xuICAgICAqICAgICBpZihpICUgMiA9PT0gMCkge1xuICAgICAqICAgICAgICAgdGhpcy5kZXN0cm95KCk7XG4gICAgICogICAgIH1cbiAgICAgKiB9KTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBlYWNoOiBmdW5jdGlvbiAoZnVuYykge1xuICAgICAgICB2YXIgaSA9IDAsXG4gICAgICAgICAgICBsID0gdGhpcy5sZW5ndGg7XG4gICAgICAgIGZvciAoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAvL3NraXAgaWYgbm90IGV4aXN0c1xuICAgICAgICAgICAgaWYgKCFlbnRpdGllc1t0aGlzW2ldXSkgY29udGludWU7XG4gICAgICAgICAgICBmdW5jLmNhbGwoZW50aXRpZXNbdGhpc1tpXV0sIGkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5nZXRcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyBBcnJheSAuZ2V0KClcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBlbnRpdGllcyBjb3JyZXNwb25kaW5nIHRvIHRoZSBhY3RpdmUgc2VsZWN0b3JcbiAgICAgKiBcbiAgICAgKiBAc2lnbiBwdWJsaWMgRW50aXR5IC5nZXQoTnVtYmVyIGluZGV4KVxuICAgICAqIEByZXR1cm5zIGFuIGVudGl0eSBiZWxvbmdpbmcgdG8gdGhlIGN1cnJlbnQgc2VsZWN0aW9uXG4gICAgICogQHBhcmFtIGluZGV4IC0gVGhlIGluZGV4IG9mIHRoZSBlbnRpdHkgdG8gcmV0dXJuLiAgSWYgbmVnYXRpdmUsIGNvdW50cyBiYWNrIGZyb20gdGhlIGVuZCBvZiB0aGUgYXJyYXkuXG4gICAgICogXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIEdldCBhbiBhcnJheSBjb250YWluaW5nIGV2ZXJ5IFwiMkRcIiBlbnRpdHlcbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgYXJyID0gQ3JhZnR5KFwiMkRcIikuZ2V0KClcbiAgICAgKiB+fn5cbiAgICAgKiBHZXQgdGhlIGZpcnN0IGVudGl0eSBtYXRjaGluZyB0aGUgc2VsZWN0b3JcbiAgICAgKiB+fn5cbiAgICAgKiAvLyBlcXVpdmFsZW50IHRvIENyYWZ0eShcIjJEXCIpLmdldCgpWzBdLCBidXQgZG9lc24ndCBjcmVhdGUgYSBuZXcgYXJyYXlcbiAgICAgKiB2YXIgZSA9IENyYWZ0eShcIjJEXCIpLmdldCgwKVxuICAgICAqIH5+flxuICAgICAqIEdldCB0aGUgbGFzdCBcIjJEXCIgZW50aXR5IG1hdGNoaW5nIHRoZSBzZWxlY3RvclxuICAgICAqIH5+flxuICAgICAqIHZhciBlID0gQ3JhZnR5KFwiMkRcIikuZ2V0KC0xKVxuICAgICAqIH5+flxuICAgICAqIFxuICAgICAqL1xuICAgIGdldDogZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgICAgdmFyIGwgPSB0aGlzLmxlbmd0aDtcbiAgICAgICAgaWYgKHR5cGVvZiBpbmRleCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgaWYgKGluZGV4ID49IGwgfHwgaW5kZXgrbCA8IDApXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmIChpbmRleD49MClcbiAgICAgICAgICAgICAgICByZXR1cm4gZW50aXRpZXNbdGhpc1tpbmRleF1dO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBlbnRpdGllc1t0aGlzW2luZGV4K2xdXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBpPTAsIHJlc3VsdCA9IFtdO1xuICAgICAgICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAvL3NraXAgaWYgbm90IGV4aXN0c1xuICAgICAgICAgICAgICAgIGlmICghZW50aXRpZXNbdGhpc1tpXV0pIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKCBlbnRpdGllc1t0aGlzW2ldXSApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5jbG9uZVxuICAgICAqIEBjb21wIENyYWZ0eSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIEVudGl0eSAuY2xvbmUodm9pZClcbiAgICAgKiBAcmV0dXJucyBDbG9uZWQgZW50aXR5IG9mIHRoZSBjdXJyZW50IGVudGl0eVxuICAgICAqXG4gICAgICogTWV0aG9kIHdpbGwgY3JlYXRlIGFub3RoZXIgZW50aXR5IHdpdGggdGhlIGV4YWN0IHNhbWVcbiAgICAgKiBwcm9wZXJ0aWVzLCBjb21wb25lbnRzIGFuZCBtZXRob2RzIGFzIHRoZSBjdXJyZW50IGVudGl0eS5cbiAgICAgKi9cbiAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY29tcHMgPSB0aGlzLl9fYyxcbiAgICAgICAgICAgIGNvbXAsXG4gICAgICAgICAgICBwcm9wLFxuICAgICAgICAgICAgY2xvbmUgPSBDcmFmdHkuZSgpO1xuXG4gICAgICAgIGZvciAoY29tcCBpbiBjb21wcykge1xuICAgICAgICAgICAgY2xvbmUuYWRkQ29tcG9uZW50KGNvbXApO1xuICAgICAgICB9XG4gICAgICAgIGZvciAocHJvcCBpbiB0aGlzKSB7XG4gICAgICAgICAgICBpZiAocHJvcCAhPSBcIjBcIiAmJiBwcm9wICE9IFwiX2dsb2JhbFwiICYmIHByb3AgIT0gXCJfY2hhbmdlZFwiICYmIHR5cGVvZiB0aGlzW3Byb3BdICE9IFwiZnVuY3Rpb25cIiAmJiB0eXBlb2YgdGhpc1twcm9wXSAhPSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgY2xvbmVbcHJvcF0gPSB0aGlzW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNsb25lO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5zZXR0ZXJcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5zZXR0ZXIoU3RyaW5nIHByb3BlcnR5LCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gcHJvcGVydHkgLSBQcm9wZXJ0eSB0byB3YXRjaCBmb3IgbW9kaWZpY2F0aW9uXG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gTWV0aG9kIHRvIGV4ZWN1dGUgaWYgdGhlIHByb3BlcnR5IGlzIG1vZGlmaWVkXG4gICAgICogV2lsbCB3YXRjaCBhIHByb3BlcnR5IHdhaXRpbmcgZm9yIG1vZGlmaWNhdGlvbiBhbmQgd2lsbCB0aGVuIGludm9rZSB0aGVcbiAgICAgKiBnaXZlbiBjYWxsYmFjayB3aGVuIGF0dGVtcHRpbmcgdG8gbW9kaWZ5LlxuICAgICAqXG4gICAgICovXG4gICAgc2V0dGVyOiBmdW5jdGlvbiAocHJvcCwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKENyYWZ0eS5zdXBwb3J0LnNldHRlcikge1xuICAgICAgICAgICAgdGhpcy5fX2RlZmluZVNldHRlcl9fKHByb3AsIGNhbGxiYWNrKTtcbiAgICAgICAgfSBlbHNlIGlmIChDcmFmdHkuc3VwcG9ydC5kZWZpbmVQcm9wZXJ0eSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHByb3AsIHtcbiAgICAgICAgICAgICAgICBzZXQ6IGNhbGxiYWNrLFxuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmRlc3Ryb3lcbiAgICAgKiBAY29tcCBDcmFmdHkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5kZXN0cm95KHZvaWQpXG4gICAgICogV2lsbCByZW1vdmUgYWxsIGV2ZW50IGxpc3RlbmVycyBhbmQgZGVsZXRlIGFsbCBwcm9wZXJ0aWVzIGFzIHdlbGwgYXMgcmVtb3ZpbmcgZnJvbSB0aGUgc3RhZ2VcbiAgICAgKi9cbiAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vcmVtb3ZlIGFsbCBldmVudCBoYW5kbGVycywgZGVsZXRlIGZyb20gZW50aXRpZXNcbiAgICAgICAgdGhpcy5lYWNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBjb21wO1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiUmVtb3ZlXCIpO1xuICAgICAgICAgICAgZm9yICh2YXIgY29tcE5hbWUgaW4gdGhpcy5fX2MpIHtcbiAgICAgICAgICAgICAgICBjb21wID0gY29tcG9uZW50c1tjb21wTmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKGNvbXAgJiYgXCJyZW1vdmVcIiBpbiBjb21wKVxuICAgICAgICAgICAgICAgICAgICBjb21wLnJlbW92ZS5jYWxsKHRoaXMsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yICh2YXIgZSBpbiBoYW5kbGVycykge1xuICAgICAgICAgICAgICAgIHRoaXMudW5iaW5kKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVsZXRlIGVudGl0aWVzW3RoaXNbMF1dO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG4vL2dpdmUgdGhlIGluaXQgaW5zdGFuY2VzIHRoZSBDcmFmdHkgcHJvdG90eXBlXG5DcmFmdHkuZm4uaW5pdC5wcm90b3R5cGUgPSBDcmFmdHkuZm47XG5cblxuLyoqQFxuICogI0NyYWZ0eS5leHRlbmRcbiAqIEBjYXRlZ29yeSBDb3JlXG4gKiBVc2VkIHRvIGV4dGVuZCB0aGUgQ3JhZnR5IG5hbWVzcGFjZS5cbiAqXG4gKi9cbkNyYWZ0eS5leHRlbmQgPSBDcmFmdHkuZm4uZXh0ZW5kID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciB0YXJnZXQgPSB0aGlzLFxuICAgICAgICBrZXk7XG5cbiAgICAvL2Rvbid0IGJvdGhlciB3aXRoIG51bGxzXG4gICAgaWYgKCFvYmopIHJldHVybiB0YXJnZXQ7XG5cbiAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgICAgaWYgKHRhcmdldCA9PT0gb2JqW2tleV0pIGNvbnRpbnVlOyAvL2hhbmRsZSBjaXJjdWxhciByZWZlcmVuY2VcbiAgICAgICAgdGFyZ2V0W2tleV0gPSBvYmpba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGFyZ2V0O1xufTtcblxuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5pbml0XG4gICAgICogQGNhdGVnb3J5IENvcmVcbiAgICAgKiBAdHJpZ2dlciBMb2FkIC0gSnVzdCBhZnRlciB0aGUgdmlld3BvcnQgaXMgaW5pdGlhbGlzZWQuIEJlZm9yZSB0aGUgRW50ZXJGcmFtZSBsb29wcyBpcyBzdGFydGVkXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmluaXQoW051bWJlciB3aWR0aCwgTnVtYmVyIGhlaWdodCwgU3RyaW5nIHN0YWdlX2VsZW1dKVxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5pbml0KFtOdW1iZXIgd2lkdGgsIE51bWJlciBoZWlnaHQsIEhUTUxFbGVtZW50IHN0YWdlX2VsZW1dKVxuICAgICAqIEBwYXJhbSBOdW1iZXIgd2lkdGggLSBXaWR0aCBvZiB0aGUgc3RhZ2VcbiAgICAgKiBAcGFyYW0gTnVtYmVyIGhlaWdodCAtIEhlaWdodCBvZiB0aGUgc3RhZ2VcbiAgICAgKiBAcGFyYW0gU3RyaW5nIG9yIEhUTUxFbGVtZW50IHN0YWdlX2VsZW0gLSB0aGUgZWxlbWVudCB0byB1c2UgZm9yIHRoZSBzdGFnZVxuICAgICAqXG4gICAgICogU2V0cyB0aGUgZWxlbWVudCB0byB1c2UgYXMgdGhlIHN0YWdlLCBjcmVhdGluZyBpdCBpZiBuZWNlc3NhcnkuICBCeSBkZWZhdWx0IGEgZGl2IHdpdGggaWQgJ2NyLXN0YWdlJyBpcyB1c2VkLCBidXQgaWYgdGhlICdzdGFnZV9lbGVtJyBhcmd1bWVudCBpcyBwcm92aWRlZCB0aGF0IHdpbGwgYmUgdXNlZCBpbnN0ZWFkLiAgKHNlZSBgQ3JhZnR5LnZpZXdwb3J0LmluaXRgKVxuICAgICAqXG4gICAgICogU3RhcnRzIHRoZSBgRW50ZXJGcmFtZWAgaW50ZXJ2YWwuIFRoaXMgd2lsbCBjYWxsIHRoZSBgRW50ZXJGcmFtZWAgZXZlbnQgZm9yIGV2ZXJ5IGZyYW1lLlxuICAgICAqXG4gICAgICogQ2FuIHBhc3Mgd2lkdGggYW5kIGhlaWdodCB2YWx1ZXMgZm9yIHRoZSBzdGFnZSBvdGhlcndpc2Ugd2lsbCBkZWZhdWx0IHRvIHdpbmRvdyBzaXplIChzZWUgYENyYWZ0eS5ET00ud2luZG93YCkuXG4gICAgICpcbiAgICAgKiBBbGwgYExvYWRgIGV2ZW50cyB3aWxsIGJlIGV4ZWN1dGVkLlxuICAgICAqXG4gICAgICogVXNlcyBgcmVxdWVzdEFuaW1hdGlvbkZyYW1lYCB0byBzeW5jIHRoZSBkcmF3aW5nIHdpdGggdGhlIGJyb3dzZXIgYnV0IHdpbGwgZGVmYXVsdCB0byBgc2V0SW50ZXJ2YWxgIGlmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgaXQuXG4gICAgICogQHNlZSBDcmFmdHkuc3RvcCwgIENyYWZ0eS52aWV3cG9ydFxuICAgICAqL1xuICAgIGluaXQ6IGZ1bmN0aW9uICh3LCBoKSB7XG4gICAgICAgIENyYWZ0eS52aWV3cG9ydC5pbml0KHcsIGgpO1xuXG4gICAgICAgIC8vY2FsbCBhbGwgYXJiaXRyYXJ5IGZ1bmN0aW9ucyBhdHRhY2hlZCB0byBvbmxvYWRcbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiTG9hZFwiKTtcbiAgICAgICAgdGhpcy50aW1lci5pbml0KCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmdldFZlcnNpb25cbiAgICAgKiBAY2F0ZWdvcnkgQ29yZVxuICAgICAqIEBzaWduIHB1YmxpYyBTdHJpbmcgQ3JhZnR5LmdldFZlcnNpb24oKVxuICAgICAqIEByZXR1cm5zIEN1cnJlbnQgdmVyc2lvbiBvZiBDcmFmdHkgYXMgYSBzdHJpbmdcbiAgICAgKlxuICAgICAqIFJldHVybiBjdXJyZW50IHZlcnNpb24gb2YgY3JhZnR5XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5nZXRWZXJzaW9uKCk7IC8vJzAuNS4yJ1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIGdldFZlcnNpb246IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHZlcnNpb247XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LnN0b3BcbiAgICAgKiBAY2F0ZWdvcnkgQ29yZVxuICAgICAqIEB0cmlnZ2VyIENyYWZ0eVN0b3AgLSB3aGVuIHRoZSBnYW1lIGlzIHN0b3BwZWRcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuc3RvcChbYm9vbCBjbGVhclN0YXRlXSlcbiAgICAgKiBAcGFyYW0gY2xlYXJTdGF0ZSAtIGlmIHRydWUgdGhlIHN0YWdlIGFuZCBhbGwgZ2FtZSBzdGF0ZSBpcyBjbGVhcmVkLlxuICAgICAqXG4gICAgICogU3RvcHMgdGhlIEVudGVyRnJhbWUgaW50ZXJ2YWwgYW5kIHJlbW92ZXMgdGhlIHN0YWdlIGVsZW1lbnQuXG4gICAgICpcbiAgICAgKiBUbyByZXN0YXJ0LCB1c2UgYENyYWZ0eS5pbml0KClgLlxuICAgICAqIEBzZWUgQ3JhZnR5LmluaXRcbiAgICAgKi9cbiAgICBzdG9wOiBmdW5jdGlvbiAoY2xlYXJTdGF0ZSkge1xuICAgICAgICB0aGlzLnRpbWVyLnN0b3AoKTsgXG5cbiAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJDcmFmdHlTdG9wXCIpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5wYXVzZVxuICAgICAqIEBjYXRlZ29yeSBDb3JlXG4gICAgICogQHRyaWdnZXIgUGF1c2UgLSB3aGVuIHRoZSBnYW1lIGlzIHBhdXNlZFxuICAgICAqIEB0cmlnZ2VyIFVucGF1c2UgLSB3aGVuIHRoZSBnYW1lIGlzIHVucGF1c2VkXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LnBhdXNlKHZvaWQpXG4gICAgICpcbiAgICAgKiBQYXVzZXMgdGhlIGdhbWUgYnkgc3RvcHBpbmcgdGhlIEVudGVyRnJhbWUgZXZlbnQgZnJvbSBmaXJpbmcuIElmIHRoZSBnYW1lIGlzIGFscmVhZHkgcGF1c2VkIGl0IGlzIHVucGF1c2VkLlxuICAgICAqIFlvdSBjYW4gcGFzcyBhIGJvb2xlYW4gcGFyYW1ldGVyIGlmIHlvdSB3YW50IHRvIHBhdXNlIG9yIHVucGF1c2UgbW8gbWF0dGVyIHdoYXQgdGhlIGN1cnJlbnQgc3RhdGUgaXMuXG4gICAgICogTW9kZXJuIGJyb3dzZXJzIHBhdXNlcyB0aGUgZ2FtZSB3aGVuIHRoZSBwYWdlIGlzIG5vdCB2aXNpYmxlIHRvIHRoZSB1c2VyLiBJZiB5b3Ugd2FudCB0aGUgUGF1c2UgZXZlbnRcbiAgICAgKiB0byBiZSB0cmlnZ2VyZWQgd2hlbiB0aGF0IGhhcHBlbnMgeW91IGNhbiBlbmFibGUgYXV0b1BhdXNlIGluIGBDcmFmdHkuc2V0dGluZ3NgLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBIYXZlIGFuIGVudGl0eSBwYXVzZSB0aGUgZ2FtZSB3aGVuIGl0IGlzIGNsaWNrZWQuXG4gICAgICogfn5+XG4gICAgICogYnV0dG9uLmJpbmQoXCJjbGlja1wiLCBmdW5jdGlvbigpIHtcbiAgICAgKiAgICAgQ3JhZnR5LnBhdXNlKCk7XG4gICAgICogfSk7XG4gICAgICogfn5+XG4gICAgICovXG4gICAgcGF1c2U6IGZ1bmN0aW9uICh0b2dnbGUpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEgPyB0b2dnbGUgOiAhdGhpcy5fcGF1c2VkKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoJ1BhdXNlJyk7XG4gICAgICAgICAgICB0aGlzLl9wYXVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnRpbWVyLnN0b3AoKTtcbiAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgQ3JhZnR5LmtleWRvd24gPSB7fTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlcignVW5wYXVzZScpO1xuICAgICAgICAgICAgdGhpcy5fcGF1c2VkID0gZmFsc2U7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBDcmFmdHkudGltZXIuaW5pdCgpO1xuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmlzUGF1c2VkXG4gICAgICogQGNhdGVnb3J5IENvcmVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuaXNQYXVzZWQoKVxuICAgICAqXG4gICAgICogQ2hlY2sgd2hldGhlciB0aGUgZ2FtZSBpcyBhbHJlYWR5IHBhdXNlZCBvciBub3QuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5pc1BhdXNlZCgpO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIGlzUGF1c2VkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXVzZWQ7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LnRpbWVyXG4gICAgICogQGNhdGVnb3J5IEdhbWUgTG9vcFxuICAgICAqIEhhbmRsZXMgZ2FtZSB0aWNrc1xuICAgICAqL1xuICAgIHRpbWVyOiAoZnVuY3Rpb24gKCkge1xuICAgICAgICAvKlxuICAgICAgICAgKiBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgb3IgaXRzIHZhcmlhbnRzIGlzIGNhbGxlZCBmb3IgYW5pbWF0aW9uLlxuICAgICAgICAgKiBgLnJlcXVlc3RJRGAga2VlcHMgYSByZWNvcmQgb2YgdGhlIHJldHVybiB2YWx1ZSBwcmV2aW91cyBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgY2FsbC5cbiAgICAgICAgICogVGhpcyBpcyBhbiBpbnRlcm5hbCB2YXJpYWJsZS4gVXNlZCB0byBzdG9wIGZyYW1lLlxuICAgICAgICAgKi9cbiAgICAgICAgdmFyIHRpY2ssIHJlcXVlc3RJRDtcblxuICAgICAgICAvLyBJbnRlcm5hbCB2YXJpYWJsZXMgdXNlZCB0byBjb250cm9sIHRoZSBnYW1lIGxvb3AuICBVc2UgQ3JhZnR5LnRpbWVyLnN0ZXB0eXBlKCkgdG8gc2V0IHRoZXNlLlxuICAgICAgICB2YXIgbW9kZSA9IFwiZml4ZWRcIixcbiAgICAgICAgICAgIG1heEZyYW1lc1BlclN0ZXAgPSA1LFxuICAgICAgICAgICAgbWF4VGltZXN0ZXAgPSA0MDtcblxuICAgICAgICAvLyB2YXJpYWJsZXMgdXNlZCBieSB0aGUgZ2FtZSBsb29wIHRvIHRyYWNrIHN0YXRlXG4gICAgICAgIHZhciBlbmRUaW1lID0gMCxcbiAgICAgICAgICAgIHRpbWVTbGlwID0gMCxcbiAgICAgICAgICAgIGdhbWVUaW1lO1xuXG4gICAgICAgIC8vIENvbnRyb2xzIHRoZSB0YXJnZXQgcmF0ZSBvZiBmaXhlZCBtb2RlIGxvb3AuICBTZXQgdGhlc2Ugd2l0aCB0aGUgQ3JhZnR5LnRpbWVyLkZQUyBmdW5jdGlvblxuICAgICAgICB2YXIgRlBTID0gNTAsXG4gICAgICAgICAgICBtaWxsaVNlY1BlckZyYW1lID0gMTAwMCAvIEZQUztcblxuXG5cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIC8vIFdoZW4gZmlyc3QgY2FsbGVkLCBzZXQgdGhlICBnYW1ldGltZSBvbmUgZnJhbWUgYmVmb3JlIG5vdyFcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGdhbWVUaW1lID09PSBcInVuZGVmaW5lZFwiKVxuICAgICAgICAgICAgICAgICAgICBnYW1lVGltZSA9IChuZXcgRGF0ZSgpLmdldFRpbWUoKSkgLSBtaWxsaVNlY1BlckZyYW1lO1xuICAgICAgICAgICAgICAgIHZhciBvbkZyYW1lID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93Lm1zUmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgIG51bGw7XG5cbiAgICAgICAgICAgICAgICBpZiAob25GcmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnRpbWVyLnN0ZXAoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3RJRCA9IG9uRnJhbWUodGljayk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2NvbnNvbGUubG9nKHJlcXVlc3RJRCArICcsICcgKyBmcmFtZSlcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICB0aWNrKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGljayA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIENyYWZ0eS50aW1lci5zdGVwKCk7XG4gICAgICAgICAgICAgICAgICAgIH0sIDEwMDAgLyBGUFMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIkNyYWZ0eVN0b3BUaW1lclwiKTtcblxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGljayA9PT0gXCJudW1iZXJcIikgY2xlYXJJbnRlcnZhbCh0aWNrKTtcblxuICAgICAgICAgICAgICAgIHZhciBvbkZyYW1lID0gd2luZG93LmNhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cud2Via2l0Q2FuY2VsUmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5tb3pDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93Lm9DYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93Lm1zQ2FuY2VsUmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgICAgIG51bGw7XG5cbiAgICAgICAgICAgICAgICBpZiAob25GcmFtZSkgb25GcmFtZShyZXF1ZXN0SUQpO1xuICAgICAgICAgICAgICAgIHRpY2sgPSBudWxsO1xuICAgICAgICAgICAgfSxcblxuXG4gICAgICAgICAgICAvKipAXG4gICAgICAgICAgICAgKiAjQ3JhZnR5LnRpbWVyLnN0ZXB0eXBlXG4gICAgICAgICAgICAgKiBAY29tcCBDcmFmdHkudGltZXJcbiAgICAgICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS50aW1lci5zdGVwdHlwZShtb2RlIFssIG1heFRpbWVTdGVwXSlcbiAgICAgICAgICAgICAqIENhbiBiZSBjYWxsZWQgdG8gc2V0IHRoZSB0eXBlIG9mIHRpbWVzdGVwIHRoZSBnYW1lIGxvb3AgdXNlc1xuICAgICAgICAgICAgICogQHBhcmFtIG1vZGUgLSB0aGUgdHlwZSBvZiB0aW1lIGxvb3AuICBBbGxvd2VkIHZhbHVlcyBhcmUgXCJmaXhlZFwiLCBcInNlbWlmaXhlZFwiLCBhbmQgXCJ2YXJpYWJsZVwiLiAgQ3JhZnR5IGRlZmF1bHRzIHRvIFwiZml4ZWRcIi5cbiAgICAgICAgICAgICAqIEBwYXJhbSBtb2RlIC0gRm9yIFwiZml4ZWRcIiwgc2V0cyB0aGUgbWF4IG51bWJlciBvZiBmcmFtZXMgcGVyIHN0ZXAuICAgRm9yIFwidmFyaWFibGVcIiBhbmQgXCJzZW1pZml4ZWRcIiwgc2V0cyB0aGUgbWF4aW11bSB0aW1lIHN0ZXAgYWxsb3dlZC5cbiAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgKiAqIEluIFwiZml4ZWRcIiBtb2RlLCBlYWNoIGZyYW1lIGlzIHNlbnQgdGhlIHNhbWUgdmFsdWUgb2YgYGR0YCwgYW5kIHRvIGFjaGlldmUgdGhlIHRhcmdldCBnYW1lIHNwZWVkLCBtdWxpdGlwbGUgZnJhbWUgZXZlbnRzIGFyZSB0cmlnZ2VyZWQgYmVmb3JlIGVhY2ggcmVuZGVyLlxuICAgICAgICAgICAgICogKiBJbiBcInZhcmlhYmxlXCIgbW9kZSwgdGhlcmUgaXMgb25seSBvbmUgZnJhbWUgdHJpZ2dlcmVkIHBlciByZW5kZXIuICBUaGlzIHJlY2lldmVzIGEgdmFsdWUgb2YgYGR0YCBlcXVhbCB0byB0aGUgYWN0dWFsIGVsYXBzZWQgdGltZSBzaW5jZSB0aGUgbGFzdCBmcmFtZS5cbiAgICAgICAgICAgICAqICogSW4gXCJzZW1pZml4ZWRcIiBtb2RlLCBtdWx0aXBsZSBmcmFtZXMgcGVyIHJlbmRlciBhcmUgcHJvY2Vzc2VkLCBhbmQgdGhlIHRvdGFsIHRpbWUgc2luY2UgdGhlIGxhc3QgZnJhbWUgaXMgZGl2aWRlZCBldmVubHkgYmV0d2VlbiB0aGVtLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICBzdGVwdHlwZTogZnVuY3Rpb24gKG5ld21vZGUsIG9wdGlvbikge1xuICAgICAgICAgICAgICAgIGlmIChuZXdtb2RlID09PSBcInZhcmlhYmxlXCIgfHwgbmV3bW9kZSA9PT0gXCJzZW1pZml4ZWRcIikge1xuICAgICAgICAgICAgICAgICAgICBtb2RlID0gbmV3bW9kZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heFRpbWVzdGVwID0gb3B0aW9uO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuZXdtb2RlID09PSBcImZpeGVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZSA9IFwiZml4ZWRcIjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heEZyYW1lc1BlclN0ZXAgPSBvcHRpb247XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgXCJJbnZhbGlkIHN0ZXAgdHlwZSBzcGVjaWZpZWRcIjtcbiAgICAgICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqQFxuICAgICAgICAgICAgICogI0NyYWZ0eS50aW1lci5zdGVwXG4gICAgICAgICAgICAgKiBAY29tcCBDcmFmdHkudGltZXJcbiAgICAgICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS50aW1lci5zdGVwKClcbiAgICAgICAgICAgICAqIEB0cmlnZ2VyIEVudGVyRnJhbWUgLSBUcmlnZ2VyZWQgb24gZWFjaCBmcmFtZS4gIFBhc3NlcyB0aGUgZnJhbWUgbnVtYmVyLCBhbmQgdGhlIGFtb3VudCBvZiB0aW1lIHNpbmNlIHRoZSBsYXN0IGZyYW1lLiAgSWYgdGhlIHRpbWUgaXMgZ3JlYXRlciB0aGFuIG1heFRpbWVzdGVwLCB0aGF0IHdpbGwgYmUgdXNlZCBpbnN0ZWFkLiAgKFRoZSBkZWZhdWx0IHZhbHVlIG9mIG1heFRpbWVzdGVwIGlzIDUwIG1zLikgLSB7IGZyYW1lOiBOdW1iZXIsIGR0Ok51bWJlciB9XG4gICAgICAgICAgICAgKiBAdHJpZ2dlciBSZW5kZXJTY2VuZSAtIFRyaWdnZXJlZCBldmVyeSB0aW1lIGEgc2NlbmUgc2hvdWxkIGJlIHJlbmRlcmVkXG4gICAgICAgICAgICAgKiBAdHJpZ2dlciBNZWFzdXJlV2FpdFRpbWUgLSBUcmlnZ2VyZWQgYXQgdGhlIGJlZ2lubmluZyBvZiBlYWNoIHN0ZXAgYWZ0ZXIgdGhlIGZpcnN0LiAgUGFzc2VzIHRoZSB0aW1lIHRoZSBnYW1lIGxvb3Agd2FpdGVkIGJldHdlZW4gc3RlcHMuIC0gTnVtYmVyXG4gICAgICAgICAgICAgKiBAdHJpZ2dlciBNZWFzdXJlRnJhbWVUaW1lIC0gVHJpZ2dlcmVkIGFmdGVyIGVhY2ggc3RlcC4gIFBhc3NlcyB0aGUgdGltZSBpdCB0b29rIHRvIGFkdmFuY2Ugb25lIGZyYW1lLiAtIE51bWJlclxuICAgICAgICAgICAgICogQHRyaWdnZXIgTWVhc3VyZVJlbmRlclRpbWUgLSBUcmlnZ2VyZWQgYWZ0ZXIgZWFjaCByZW5kZXIuIFBhc3NlcyB0aGUgdGltZSBpdCB0b29rIHRvIHJlbmRlciB0aGUgc2NlbmUgLSBOdW1iZXJcbiAgICAgICAgICAgICAqIEFkdmFuY2VzIHRoZSBnYW1lIGJ5IHRyaWdnZXJpbmcgYEVudGVyRnJhbWVgIGFuZCBgUmVuZGVyU2NlbmVgXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHN0ZXA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgZHJhd1RpbWVTdGFydCwgZHQsIGxhc3RGcmFtZVRpbWUsIGxvb3BzID0gMDtcblxuICAgICAgICAgICAgICAgIGN1cnJlbnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgaWYgKGVuZFRpbWUgPiAwKVxuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIk1lYXN1cmVXYWl0VGltZVwiLCBjdXJyZW50VGltZSAtIGVuZFRpbWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgY3VycmVudGx5IGFoZWFkIG9mIHRoZSBjdXJyZW50IHRpbWUsIHdlIG5lZWQgdG8gd2FpdCB1bnRpbCB3ZSdyZSBub3QhXG4gICAgICAgICAgICAgICAgaWYgKGdhbWVUaW1lICsgdGltZVNsaXAgPj0gY3VycmVudFRpbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgZW5kVGltZSA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIG5ldFRpbWVTdGVwID0gY3VycmVudFRpbWUgLSAoZ2FtZVRpbWUgKyB0aW1lU2xpcCk7XG4gICAgICAgICAgICAgICAgLy8gV2UgdHJ5IHRvIGtlZXAgdXAgd2l0aCB0aGUgdGFyZ2V0IEZQUyBieSBwcm9jZXNzaW5nIG11bHRpcGxlIGZyYW1lcyBwZXIgcmVuZGVyXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UncmUgaG9wZWxlc3NseSBiZWhpbmQsIHN0b3AgdHJ5aW5nIHRvIGNhdGNoIHVwLlxuICAgICAgICAgICAgICAgIGlmIChuZXRUaW1lU3RlcCA+IG1pbGxpU2VjUGVyRnJhbWUgKiAyMCkge1xuICAgICAgICAgICAgICAgICAgICAvL2dhbWVUaW1lID0gY3VycmVudFRpbWUgLSBtaWxsaVNlY1BlckZyYW1lO1xuICAgICAgICAgICAgICAgICAgICB0aW1lU2xpcCArPSBuZXRUaW1lU3RlcCAtIG1pbGxpU2VjUGVyRnJhbWU7XG4gICAgICAgICAgICAgICAgICAgIG5ldFRpbWVTdGVwID0gbWlsbGlTZWNQZXJGcmFtZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTZXQgdXAgaG93IHRpbWUgaXMgaW5jcmVtZW50ZWRcbiAgICAgICAgICAgICAgICBpZiAobW9kZSA9PT0gXCJmaXhlZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvb3BzID0gTWF0aC5jZWlsKG5ldFRpbWVTdGVwIC8gbWlsbGlTZWNQZXJGcmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIG1heEZyYW1lc1BlclN0ZXAgYWRqdXN0cyBob3cgd2lsbGluZyB3ZSBhcmUgdG8gZGVsYXkgZHJhd2luZyBpbiBvcmRlciB0byBrZWVwIGF0IHRoZSB0YXJnZXQgRlBTXG4gICAgICAgICAgICAgICAgICAgIGxvb3BzID0gTWF0aC5taW4obG9vcHMsIG1heEZyYW1lc1BlclN0ZXApO1xuICAgICAgICAgICAgICAgICAgICBkdCA9IG1pbGxpU2VjUGVyRnJhbWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtb2RlID09PSBcInZhcmlhYmxlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9vcHMgPSAxO1xuICAgICAgICAgICAgICAgICAgICBkdCA9IG5ldFRpbWVTdGVwO1xuICAgICAgICAgICAgICAgICAgICAvLyBtYXhUaW1lc3RlcCBpcyB0aGUgbWF4aW11bSB0aW1lIHRvIGJlIHByb2Nlc3NlZCBpbiBhIGZyYW1lLiAgKExhcmdlIGR0ID0+IHVuc3RhYmxlIHBoeXNpY3MpXG4gICAgICAgICAgICAgICAgICAgIGR0ID0gTWF0aC5taW4oZHQsIG1heFRpbWVzdGVwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGUgPT09IFwic2VtaWZpeGVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9vcHMgPSBNYXRoLmNlaWwobmV0VGltZVN0ZXAgLyBtYXhUaW1lc3RlcCk7XG4gICAgICAgICAgICAgICAgICAgIGR0ID0gbmV0VGltZVN0ZXAgLyBsb29wcztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBQcm9jZXNzIGZyYW1lcywgaW5jcmVtZW50aW5nIHRoZSBnYW1lIGNsb2NrIHdpdGggZWFjaCBmcmFtZS5cbiAgICAgICAgICAgICAgICAvLyBkdCBpcyBkZXRlcm1pbmVkIGJ5IHRoZSBtb2RlXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsb29wczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gRXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgb3ZlciB0aW1lIGhvb2tzIGludG8gdGhpcyBldmVudFxuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIkVudGVyRnJhbWVcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnJhbWU6IGZyYW1lKyssXG4gICAgICAgICAgICAgICAgICAgICAgICBkdDogZHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBnYW1lVGltZTogZ2FtZVRpbWVcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGdhbWVUaW1lICs9IGR0O1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIk1lYXN1cmVGcmFtZVRpbWVcIiwgY3VycmVudFRpbWUgLSBsYXN0RnJhbWVUaW1lKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL0lmIGFueSBmcmFtZXMgd2VyZSBwcm9jZXNzZWQsIHJlbmRlciB0aGUgcmVzdWx0c1xuICAgICAgICAgICAgICAgIGlmIChsb29wcyA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZHJhd1RpbWVTdGFydCA9IGN1cnJlbnRUaW1lO1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlJlbmRlclNjZW5lXCIpO1xuICAgICAgICAgICAgICAgICAgICAvLyBQb3N0LXJlbmRlciBjbGVhbnVwIG9wcG9ydHVuaXR5XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiUG9zdFJlbmRlclwiKTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJNZWFzdXJlUmVuZGVyVGltZVwiLCBjdXJyZW50VGltZSAtIGRyYXdUaW1lU3RhcnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGVuZFRpbWUgPSBjdXJyZW50VGltZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKipAXG4gICAgICAgICAgICAgKiAjQ3JhZnR5LnRpbWVyLkZQU1xuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnRpbWVyXG4gICAgICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudGltZXIuRlBTKClcbiAgICAgICAgICAgICAqIFJldHVybnMgdGhlIHRhcmdldCBmcmFtZXMgcGVyIHNlY29uZC4gVGhpcyBpcyBub3QgYW4gYWN0dWFsIGZyYW1lIHJhdGUuXG4gICAgICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudGltZXIuRlBTKE51bWJlciB2YWx1ZSlcbiAgICAgICAgICAgICAqIEBwYXJhbSB2YWx1ZSAtIHRoZSB0YXJnZXQgcmF0ZVxuICAgICAgICAgICAgICogU2V0cyB0aGUgdGFyZ2V0IGZyYW1lcyBwZXIgc2Vjb25kLiBUaGlzIGlzIG5vdCBhbiBhY3R1YWwgZnJhbWUgcmF0ZS5cbiAgICAgICAgICAgICAqIFRoZSBkZWZhdWx0IHJhdGUgaXMgNTAuXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIEZQUzogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PSBcInVuZGVmaW5lZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRlBTO1xuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBGUFMgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgbWlsbGlTZWNQZXJGcmFtZSA9IDEwMDAgLyBGUFM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqQFxuICAgICAgICAgICAgICogI0NyYWZ0eS50aW1lci5zaW11bGF0ZUZyYW1lc1xuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnRpbWVyXG4gICAgICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkudGltZXIuc2ltdWxhdGVGcmFtZXMoTnVtYmVyIGZyYW1lc1ssIE51bWJlciB0aW1lc3RlcF0pXG4gICAgICAgICAgICAgKiBBZHZhbmNlcyB0aGUgZ2FtZSBzdGF0ZSBieSBhIG51bWJlciBvZiBmcmFtZXMgYW5kIGRyYXdzIHRoZSByZXN1bHRpbmcgc3RhZ2UgYXQgdGhlIGVuZC4gVXNlZnVsIGZvciB0ZXN0cyBhbmQgZGVidWdnaW5nLlxuICAgICAgICAgICAgICogQHBhcmFtIGZyYW1lcyAtIG51bWJlciBvZiBmcmFtZXMgdG8gc2ltdWxhdGVcbiAgICAgICAgICAgICAqIEBwYXJhbSB0aW1lc3RlcCAtIHRoZSBkdXJhdGlvbiB0byBwYXNzIGVhY2ggZnJhbWUuICBEZWZhdWx0cyB0byBtaWxsaVNlY1BlckZyYW1lICgyMCBtcykgaWYgbm90IHNwZWNpZmllZC5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgc2ltdWxhdGVGcmFtZXM6IGZ1bmN0aW9uIChmcmFtZXMsIHRpbWVzdGVwKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0aW1lc3RlcCA9PT0gXCJ1bmRlZmluZWRcIilcbiAgICAgICAgICAgICAgICAgICAgdGltZXN0ZXAgPSBtaWxsaVNlY1BlckZyYW1lO1xuICAgICAgICAgICAgICAgIHdoaWxlIChmcmFtZXMtLSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJFbnRlckZyYW1lXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyYW1lOiBmcmFtZSsrLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHQ6IHRpbWVzdGVwXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlJlbmRlclNjZW5lXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pKCksXG5cblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmVcbiAgICAgKiBAY2F0ZWdvcnkgQ29yZVxuICAgICAqIEB0cmlnZ2VyIE5ld0VudGl0eSAtIFdoZW4gdGhlIGVudGl0eSBpcyBjcmVhdGVkIGFuZCBhbGwgY29tcG9uZW50cyBhcmUgYWRkZWQgLSB7IGlkOk51bWJlciB9XG4gICAgICogQHNpZ24gcHVibGljIEVudGl0eSBDcmFmdHkuZShTdHJpbmcgY29tcG9uZW50TGlzdClcbiAgICAgKiBAcGFyYW0gY29tcG9uZW50TGlzdCAtIExpc3Qgb2YgY29tcG9uZW50cyB0byBhc3NpZ24gdG8gbmV3IGVudGl0eVxuICAgICAqIEBzaWduIHB1YmxpYyBFbnRpdHkgQ3JhZnR5LmUoU3RyaW5nIGNvbXBvbmVudDFbLCAuLiwgU3RyaW5nIGNvbXBvbmVudE5dKVxuICAgICAqIEBwYXJhbSBjb21wb25lbnQjIC0gQ29tcG9uZW50IHRvIGFkZFxuICAgICAqXG4gICAgICogQ3JlYXRlcyBhbiBlbnRpdHkuIEFueSBhcmd1bWVudHMgd2lsbCBiZSBhcHBsaWVkIGluIHRoZSBzYW1lXG4gICAgICogd2F5IGAuYWRkQ29tcG9uZW50KClgIGlzIGFwcGxpZWQgYXMgYSBxdWljayB3YXkgdG8gYWRkIGNvbXBvbmVudHMuXG4gICAgICpcbiAgICAgKiBBbnkgY29tcG9uZW50IGFkZGVkIHdpbGwgYXVnbWVudCB0aGUgZnVuY3Rpb25hbGl0eSBvZlxuICAgICAqIHRoZSBjcmVhdGVkIGVudGl0eSBieSBhc3NpZ25pbmcgdGhlIHByb3BlcnRpZXMgYW5kIG1ldGhvZHMgZnJvbSB0aGUgY29tcG9uZW50IHRvIHRoZSBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIHZhciBteUVudGl0eSA9IENyYWZ0eS5lKFwiMkQsIERPTSwgQ29sb3JcIik7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5jXG4gICAgICovXG4gICAgZTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgaWQgPSBVSUQoKSxcbiAgICAgICAgICAgIGNyYWZ0O1xuXG4gICAgICAgIGVudGl0aWVzW2lkXSA9IG51bGw7IC8vcmVnaXN0ZXIgdGhlIHNwYWNlXG4gICAgICAgIGVudGl0aWVzW2lkXSA9IGNyYWZ0ID0gQ3JhZnR5KGlkKTtcblxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNyYWZ0LmFkZENvbXBvbmVudC5hcHBseShjcmFmdCwgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBjcmFmdC5zZXROYW1lKCdFbnRpdHkgIycgKyBpZCk7IC8vc2V0IGRlZmF1bHQgZW50aXR5IGh1bWFuIHJlYWRhYmxlIG5hbWVcbiAgICAgICAgY3JhZnQuYWRkQ29tcG9uZW50KFwib2JqXCIpOyAvL2V2ZXJ5IGVudGl0eSBhdXRvbWF0aWNhbGx5IGFzc3VtZXMgb2JqXG5cbiAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJOZXdFbnRpdHlcIiwge1xuICAgICAgICAgICAgaWQ6IGlkXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBjcmFmdDtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuY1xuICAgICAqIEBjYXRlZ29yeSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5LmMoU3RyaW5nIG5hbWUsIE9iamVjdCBjb21wb25lbnQpXG4gICAgICogQHBhcmFtIG5hbWUgLSBOYW1lIG9mIHRoZSBjb21wb25lbnRcbiAgICAgKiBAcGFyYW0gY29tcG9uZW50IC0gT2JqZWN0IHdpdGggdGhlIGNvbXBvbmVudCdzIHByb3BlcnRpZXMgYW5kIG1ldGhvZHNcbiAgICAgKiBDcmVhdGVzIGEgY29tcG9uZW50IHdoZXJlIHRoZSBmaXJzdCBhcmd1bWVudCBpcyB0aGUgSUQgYW5kIHRoZSBzZWNvbmRcbiAgICAgKiBpcyB0aGUgb2JqZWN0IHRoYXQgd2lsbCBiZSBpbmhlcml0ZWQgYnkgZW50aXRpZXMuXG4gICAgICpcbiAgICAgKiBBIGNvdXBsZSBvZiBtZXRob2RzIGFyZSB0cmVhdGVkIHNwZWNpYWxseS4gVGhleSBhcmUgaW52b2tlZCBpbiBwYXJ0aXVsYXIgY29udGV4dHMsIGFuZCAoaW4gdGhvc2UgY29udGV4dHMpIGNhbm5vdCBiZSBvdmVycmlkZGVuIGJ5IG90aGVyIGNvbXBvbmVudHMuXG4gICAgICpcbiAgICAgKiAtIGBpbml0YCB3aWxsIGJlIGNhbGxlZCB3aGVuIHRoZSBjb21wb25lbnQgaXMgYWRkZWQgdG8gYW4gZW50aXR5XG4gICAgICogLSBgcmVtb3ZlYCB3aWxsIGJlIGNhbGxlZCBqdXN0IGJlZm9yZSBhIGNvbXBvbmVudCBpcyByZW1vdmVkLCBvciBiZWZvcmUgYW4gZW50aXR5IGlzIGRlc3Ryb3llZC4gSXQgaXMgcGFzc2VkIGEgc2luZ2xlIGJvb2xlYW4gcGFyYW1ldGVyIHRoYXQgaXMgYHRydWVgIGlmIHRoZSBlbnRpdHkgaXMgYmVpbmcgZGVzdHJveWVkLlxuICAgICAqXG4gICAgICogSW4gYWRkaXRpb24gdG8gdGhlc2UgaGFyZGNvZGVkIHNwZWNpYWwgbWV0aG9kcywgdGhlcmUgYXJlIHNvbWUgY29udmVudGlvbnMgZm9yIHdyaXRpbmcgY29tcG9uZW50cy5cbiAgICAgKlxuICAgICAqIC0gUHJvcGVydGllcyBvciBtZXRob2RzIHRoYXQgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIGFyZSBjb25zaWRlcmVkIHByaXZhdGUuXG4gICAgICogLSBBIG1ldGhvZCB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgdGhlIGNvbXBvbmVudCBpcyBjb25zaWRlcmVkIHRvIGJlIGEgY29uc3RydWN0b3JcbiAgICAgKiBhbmQgaXMgZ2VuZXJhbGx5IHVzZWQgd2hlbiB5b3UgbmVlZCB0byBwYXNzIGNvbmZpZ3VyYXRpb24gZGF0YSB0byB0aGUgY29tcG9uZW50IG9uIGEgcGVyIGVudGl0eSBiYXNpcy5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmMoXCJBbm5veWluZ1wiLCB7XG4gICAgICogICAgIF9tZXNzYWdlOiBcIkhpSGlcIixcbiAgICAgKiAgICAgaW5pdDogZnVuY3Rpb24oKSB7XG4gICAgICogICAgICAgICB0aGlzLmJpbmQoXCJFbnRlckZyYW1lXCIsIGZ1bmN0aW9uKCkgeyBhbGVydCh0aGlzLm1lc3NhZ2UpOyB9KTtcbiAgICAgKiAgICAgfSxcbiAgICAgKiAgICAgYW5ub3lpbmc6IGZ1bmN0aW9uKG1lc3NhZ2UpIHsgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTsgfVxuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogQ3JhZnR5LmUoXCJBbm5veWluZ1wiKS5hbm5veWluZyhcIkknbSBhbiBvcmFuZ2UuLi5cIik7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKlxuICAgICAqIFdBUk5JTkc6XG4gICAgICpcbiAgICAgKiBpbiB0aGUgZXhhbXBsZSBhYm92ZSB0aGUgZmllbGQgX21lc3NhZ2UgaXMgbG9jYWwgdG8gdGhlIGVudGl0eS4gVGhhdCBpcywgaWYgeW91IGNyZWF0ZSBtYW55IGVudGl0aWVzIHdpdGggdGhlIEFubm95aW5nIGNvbXBvbmVudCB0aGV5IGNhbiBhbGwgaGF2ZSBkaWZmZXJlbnQgdmFsdWVzIGZvciBfbWVzc2FnZS4gVGhhdCBpcyBiZWNhdXNlIGl0IGlzIGEgc2ltcGxlIHZhbHVlLCBhbmQgc2ltcGxlIHZhbHVlcyBhcmUgY29waWVkIGJ5IHZhbHVlLiBJZiBob3dldmVyIHRoZSBmaWVsZCBoYWQgYmVlbiBhbiBvYmplY3Qgb3IgYXJyYXksIHRoZSB2YWx1ZSB3b3VsZCBoYXZlIGJlZW4gc2hhcmVkIGJ5IGFsbCBlbnRpdGllcyB3aXRoIHRoZSBjb21wb25lbnQgYmVjYXVzZSBjb21wbGV4IHR5cGVzIGFyZSBjb3BpZWQgYnkgcmVmZXJlbmNlIGluIGphdmFzY3JpcHQuIFRoaXMgaXMgcHJvYmFibHkgbm90IHdoYXQgeW91IHdhbnQgYW5kIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSBkZW1vbnN0cmF0ZXMgaG93IHRvIHdvcmsgYXJvdW5kIGl0OlxuICAgICAqXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmMoXCJNeUNvbXBvbmVudFwiLCB7XG4gICAgICogICAgIF9pQW1TaGFyZWQ6IHsgYTogMywgYjogNCB9LFxuICAgICAqICAgICBpbml0OiBmdW5jdGlvbigpIHtcbiAgICAgKiAgICAgICAgIHRoaXMuX2lBbU5vdFNoYXJlZCA9IHsgYTogMywgYjogNCB9O1xuICAgICAqICAgICB9LFxuICAgICAqIH0pO1xuICAgICAqIH5+flxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkuZVxuICAgICAqL1xuICAgIGM6IGZ1bmN0aW9uIChjb21wTmFtZSwgY29tcG9uZW50KSB7XG4gICAgICAgIGNvbXBvbmVudHNbY29tcE5hbWVdID0gY29tcG9uZW50O1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS50cmlnZ2VyXG4gICAgICogQGNhdGVnb3J5IENvcmUsIEV2ZW50c1xuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS50cmlnZ2VyKFN0cmluZyBldmVudE5hbWUsICogZGF0YSlcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gdHJpZ2dlclxuICAgICAqIEBwYXJhbSBkYXRhIC0gQXJiaXRyYXJ5IGRhdGEgdG8gcGFzcyBpbnRvIHRoZSBjYWxsYmFjayBhcyBhbiBhcmd1bWVudFxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2Qgd2lsbCB0cmlnZ2VyIGV2ZXJ5IHNpbmdsZSBjYWxsYmFjayBhdHRhY2hlZCB0byB0aGUgZXZlbnQgbmFtZS4gVGhpcyBtZWFuc1xuICAgICAqIGV2ZXJ5IGdsb2JhbCBldmVudCBhbmQgZXZlcnkgZW50aXR5IHRoYXQgaGFzIGEgY2FsbGJhY2suXG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5iaW5kXG4gICAgICovXG4gICAgdHJpZ2dlcjogZnVuY3Rpb24gKGV2ZW50LCBkYXRhKSB7XG5cbiAgICAgICAgLy8gKFRvIGxlYXJuIGhvdyB0aGUgaGFuZGxlcnMgb2JqZWN0IHdvcmtzLCBzZWUgaW5saW5lIGNvbW1lbnQgYXQgQ3JhZnR5LmJpbmQpXG4gICAgICAgIHZhciBoZGwgPSBoYW5kbGVyc1tldmVudF0sXG4gICAgICAgICAgICBoLCBpLCBsLCBjYWxsYmFja3MsIGNvbnRleHQ7XG4gICAgICAgIC8vbG9vcCBvdmVyIGV2ZXJ5IG9iamVjdCBib3VuZFxuICAgICAgICBmb3IgKGggaW4gaGRsKSB7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIHdoZXRoZXIgaCBuZWVkcyB0byBiZSBwcm9jZXNzZWRcbiAgICAgICAgICAgIGlmICghaGRsLmhhc093blByb3BlcnR5KGgpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNhbGxiYWNrcyA9IGhkbFtoXTtcbiAgICAgICAgICAgIGlmICghY2FsbGJhY2tzIHx8IGNhbGxiYWNrcy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAvL2lmIGFuIGVudGl0eSwgY2FsbCB3aXRoIHRoYXQgY29udGV4dDsgZWxzZSB0aGUgZ2xvYmFsIGNvbnRleHRcbiAgICAgICAgICAgIGlmIChlbnRpdGllc1toXSlcbiAgICAgICAgICAgICAgICBjb250ZXh0ID0gQ3JhZnR5KCtoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBjb250ZXh0ID0gQ3JhZnR5O1xuXG4gICAgICAgICAgICAvL2xvb3Agb3ZlciBldmVyeSBoYW5kbGVyIHdpdGhpbiBvYmplY3RcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgYSBjYWxsYmFjayBpZiBpdCBoYXMgYmVlbiBkZWxldGVkXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjYWxsYmFja3NbaV0gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFja3NbaV0uY2FsbChjb250ZXh0LCBkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5iaW5kXG4gICAgICogQGNhdGVnb3J5IENvcmUsIEV2ZW50c1xuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgYmluZChTdHJpbmcgZXZlbnROYW1lLCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gYmluZCB0b1xuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIE1ldGhvZCB0byBleGVjdXRlIHVwb24gZXZlbnQgdHJpZ2dlcmVkXG4gICAgICogQHJldHVybnMgY2FsbGJhY2sgZnVuY3Rpb24gd2hpY2ggY2FuIGJlIHVzZWQgZm9yIHVuYmluZFxuICAgICAqXG4gICAgICogQmluZHMgdG8gYSBnbG9iYWwgZXZlbnQuIE1ldGhvZCB3aWxsIGJlIGV4ZWN1dGVkIHdoZW4gYENyYWZ0eS50cmlnZ2VyYCBpcyB1c2VkXG4gICAgICogd2l0aCB0aGUgZXZlbnQgbmFtZS5cbiAgICAgKlxuICAgICAqIEBzZWUgQ3JhZnR5LnRyaWdnZXIsIENyYWZ0eS51bmJpbmRcbiAgICAgKi9cbiAgICBiaW5kOiBmdW5jdGlvbiAoZXZlbnQsIGNhbGxiYWNrKSB7XG5cbiAgICAgICAgLy8gQmFja2dyb3VuZDogVGhlIHN0cnVjdHVyZSBvZiB0aGUgZ2xvYmFsIG9iamVjdCBcImhhbmRsZXJzXCJcbiAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIC8vIEhlcmUgaXMgYW4gZXhhbXBsZSBvZiB3aGF0IFwiaGFuZGxlcnNcIiBjYW4gbG9vayBsaWtlOlxuICAgICAgICAvLyBoYW5kbGVycyA9PT1cbiAgICAgICAgLy8gICAgeyBNb3ZlOiAgezU6W2ZuQV0sIDY6W2ZuQiwgZm5DXSwgZ2xvYmFsOltmbkRdfSxcbiAgICAgICAgLy8gICAgIENoYW5nZTogezY6W2ZuRV19XG4gICAgICAgIC8vICAgIH1cbiAgICAgICAgLy8gSW4gdGhpcyBleGFtcGxlLCB3aGVuIHRoZSAnTW92ZScgZXZlbnQgaXMgdHJpZ2dlcmVkIG9uIGVudGl0eSAjNiAoZS5nLlxuICAgICAgICAvLyBlbnRpdHk2LnRyaWdnZXIoJ01vdmUnKSksIGl0IGNhdXNlcyB0aGUgZXhlY3V0aW9uIG9mIGZuQigpIGFuZCBmbkMoKS4gV2hlblxuICAgICAgICAvLyB0aGUgTW92ZSBldmVudCBpcyB0cmlnZ2VyZWQgZ2xvYmFsbHkgKGkuZS4gQ3JhZnR5LnRyaWdnZXIoJ01vdmUnKSksIGl0XG4gICAgICAgIC8vIHdpbGwgZXhlY3V0ZSBmbkEsIGZuQiwgZm5DLCBmbkQuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEluIHRoaXMgZXhhbXBsZSwgXCJ0aGlzXCIgaXMgYm91bmQgdG8gZW50aXR5ICM2IHdoZW5ldmVyIGZuQigpIGlzIGV4ZWN1dGVkLCBhbmRcbiAgICAgICAgLy8gXCJ0aGlzXCIgaXMgYm91bmQgdG8gQ3JhZnR5IHdoZW5ldmVyIGZuRCgpIGlzIGV4ZWN1dGVkLlxuICAgICAgICAvL1xuICAgICAgICAvLyBJbiBvdGhlciB3b3JkcywgdGhlIHN0cnVjdHVyZSBvZiBcImhhbmRsZXJzXCIgaXM6XG4gICAgICAgIC8vXG4gICAgICAgIC8vIGhhbmRsZXJzW2V2ZW50XVtlbnRpdHlJRCBvciAnZ2xvYmFsJ10gPT09IChBcnJheSBvZiBjYWxsYmFjayBmdW5jdGlvbnMpXG5cbiAgICAgICAgaWYgKCFoYW5kbGVyc1tldmVudF0pIGhhbmRsZXJzW2V2ZW50XSA9IHt9O1xuICAgICAgICB2YXIgaGRsID0gaGFuZGxlcnNbZXZlbnRdO1xuXG4gICAgICAgIGlmICghaGRsLmdsb2JhbCkgaGRsLmdsb2JhbCA9IFtdO1xuICAgICAgICBoZGwuZ2xvYmFsLnB1c2goY2FsbGJhY2spO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2s7XG4gICAgfSxcblxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkudW5pcXVlQmluZFxuICAgICAqIEBjYXRlZ29yeSBDb3JlLCBFdmVudHNcbiAgICAgKiBAc2lnbiBwdWJsaWMgTnVtYmVyIHVuaXF1ZUJpbmQoU3RyaW5nIGV2ZW50TmFtZSwgRnVuY3Rpb24gY2FsbGJhY2spXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSAtIE5hbWUgb2YgdGhlIGV2ZW50IHRvIGJpbmQgdG9cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBNZXRob2QgdG8gZXhlY3V0ZSB1cG9uIGV2ZW50IHRyaWdnZXJlZFxuICAgICAqIEByZXR1cm5zIGNhbGxiYWNrIGZ1bmN0aW9uIHdoaWNoIGNhbiBiZSB1c2VkIGZvciB1bmJpbmRcbiAgICAgKlxuICAgICAqIFdvcmtzIGxpa2UgQ3JhZnR5LmJpbmQsIGJ1dCBwcmV2ZW50cyBhIGNhbGxiYWNrIGZyb20gYmVpbmcgYm91bmQgbXVsdGlwbGUgdGltZXMuXG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5iaW5kXG4gICAgICovXG4gICAgdW5pcXVlQmluZDogZnVuY3Rpb24gKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICB0aGlzLnVuYmluZChldmVudCwgY2FsbGJhY2spO1xuICAgICAgICByZXR1cm4gdGhpcy5iaW5kKGV2ZW50LCBjYWxsYmFjayk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm9uZVxuICAgICAqIEBjYXRlZ29yeSBDb3JlLCBFdmVudHNcbiAgICAgKiBAc2lnbiBwdWJsaWMgTnVtYmVyIG9uZShTdHJpbmcgZXZlbnROYW1lLCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gTmFtZSBvZiB0aGUgZXZlbnQgdG8gYmluZCB0b1xuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIE1ldGhvZCB0byBleGVjdXRlIHVwb24gZXZlbnQgdHJpZ2dlcmVkXG4gICAgICogQHJldHVybnMgY2FsbGJhY2sgZnVuY3Rpb24gd2hpY2ggY2FuIGJlIHVzZWQgZm9yIHVuYmluZFxuICAgICAqXG4gICAgICogV29ya3MgbGlrZSBDcmFmdHkuYmluZCwgYnV0IHdpbGwgYmUgdW5ib3VuZCBvbmNlIHRoZSBldmVudCB0cmlnZ2Vycy5cbiAgICAgKlxuICAgICAqIEBzZWUgQ3JhZnR5LmJpbmRcbiAgICAgKi9cbiAgICBvbmU6IGZ1bmN0aW9uIChldmVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgb25lSGFuZGxlciA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICAgICAgICBjYWxsYmFjay5jYWxsKHNlbGYsIGRhdGEpO1xuICAgICAgICAgICAgc2VsZi51bmJpbmQoZXZlbnQsIG9uZUhhbmRsZXIpO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gc2VsZi5iaW5kKGV2ZW50LCBvbmVIYW5kbGVyKTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkudW5iaW5kXG4gICAgICogQGNhdGVnb3J5IENvcmUsIEV2ZW50c1xuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIENyYWZ0eS51bmJpbmQoU3RyaW5nIGV2ZW50TmFtZSwgRnVuY3Rpb24gY2FsbGJhY2spXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSAtIE5hbWUgb2YgdGhlIGV2ZW50IHRvIHVuYmluZFxuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIEZ1bmN0aW9uIHRvIHVuYmluZFxuICAgICAqIEBzaWduIHB1YmxpYyBCb29sZWFuIENyYWZ0eS51bmJpbmQoU3RyaW5nIGV2ZW50TmFtZSwgTnVtYmVyIGNhbGxiYWNrSUQpXG4gICAgICogQHBhcmFtIGNhbGxiYWNrSUQgLSBJRCBvZiB0aGUgY2FsbGJhY2tcbiAgICAgKiBAcmV0dXJucyBUcnVlIG9yIGZhbHNlIGRlcGVuZGluZyBvbiBpZiBhIGNhbGxiYWNrIHdhcyB1bmJvdW5kXG4gICAgICogVW5iaW5kIGFueSBldmVudCBmcm9tIGFueSBlbnRpdHkgb3IgZ2xvYmFsIGV2ZW50LlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogICAgdmFyIHBsYXlfZ2FtZW92ZXJfc291bmQgPSBmdW5jdGlvbiAoKSB7Li4ufTtcbiAgICAgKiAgICBDcmFmdHkuYmluZCgnR2FtZU92ZXInLCBwbGF5X2dhbWVvdmVyX3NvdW5kKTtcbiAgICAgKiAgICAuLi5cbiAgICAgKiAgICBDcmFmdHkudW5iaW5kKCdHYW1lT3ZlcicsIHBsYXlfZ2FtZW92ZXJfc291bmQpO1xuICAgICAqIH5+flxuICAgICAqXG4gICAgICogVGhlIGZpcnN0IGxpbmUgZGVmaW5lcyBhIGNhbGxiYWNrIGZ1bmN0aW9uLiBUaGUgc2Vjb25kIGxpbmUgYmluZHMgdGhhdFxuICAgICAqIGZ1bmN0aW9uIHNvIHRoYXQgYENyYWZ0eS50cmlnZ2VyKCdHYW1lT3ZlcicpYCBjYXVzZXMgdGhhdCBmdW5jdGlvbiB0b1xuICAgICAqIHJ1bi4gVGhlIHRoaXJkIGxpbmUgdW5iaW5kcyB0aGF0IGZ1bmN0aW9uLlxuICAgICAqXG4gICAgICogfn5+XG4gICAgICogICAgQ3JhZnR5LnVuYmluZCgnR2FtZU92ZXInKTtcbiAgICAgKiB+fn5cbiAgICAgKlxuICAgICAqIFRoaXMgdW5iaW5kcyBBTEwgZ2xvYmFsIGNhbGxiYWNrcyBmb3IgdGhlIGV2ZW50ICdHYW1lT3ZlcicuIFRoYXRcbiAgICAgKiBpbmNsdWRlcyBhbGwgY2FsbGJhY2tzIGF0dGFjaGVkIGJ5IGBDcmFmdHkuYmluZCgnR2FtZU92ZXInLCAuLi4pYCwgYnV0XG4gICAgICogbm9uZSBvZiB0aGUgY2FsbGJhY2tzIGF0dGFjaGVkIGJ5IGBzb21lX2VudGl0eS5iaW5kKCdHYW1lT3ZlcicsIC4uLilgLlxuICAgICAqL1xuICAgIHVuYmluZDogZnVuY3Rpb24gKGV2ZW50LCBjYWxsYmFjaykge1xuICAgICAgICAvLyAoVG8gbGVhcm4gaG93IHRoZSBoYW5kbGVycyBvYmplY3Qgd29ya3MsIHNlZSBpbmxpbmUgY29tbWVudCBhdCBDcmFmdHkuYmluZClcbiAgICAgICAgdmFyIGhkbCA9IGhhbmRsZXJzW2V2ZW50XSxcbiAgICAgICAgICAgIGksIGwsIGdsb2JhbF9jYWxsYmFja3MsIGZvdW5kX21hdGNoO1xuXG4gICAgICAgIGlmIChoZGwgPT09IHVuZGVmaW5lZCB8fCBoZGwuZ2xvYmFsID09PSB1bmRlZmluZWQgfHwgaGRsLmdsb2JhbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIG5vIGNhbGxiYWNrIHdhcyBzdXBwbGllZCwgZGVsZXRlIGV2ZXJ5dGhpbmdcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBoZGwuZ2xvYmFsO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBsb29wIG92ZXIgdGhlIGdsb2JhbGx5LWF0dGFjaGVkIGV2ZW50c1xuICAgICAgICBnbG9iYWxfY2FsbGJhY2tzID0gaGRsLmdsb2JhbDtcbiAgICAgICAgZm91bmRfbWF0Y2ggPSBmYWxzZTtcbiAgICAgICAgZm9yIChpID0gMCwgbCA9IGdsb2JhbF9jYWxsYmFja3MubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsX2NhbGxiYWNrc1tpXSA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBmb3VuZF9tYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGdsb2JhbF9jYWxsYmFja3NbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvdW5kX21hdGNoO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5mcmFtZVxuICAgICAqIEBjYXRlZ29yeSBDb3JlXG4gICAgICogQHNpZ24gcHVibGljIE51bWJlciBDcmFmdHkuZnJhbWUodm9pZClcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IGZyYW1lIG51bWJlclxuICAgICAqL1xuICAgIGZyYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBmcmFtZTtcbiAgICB9LFxuXG4gICAgY29tcG9uZW50czogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY29tcG9uZW50cztcbiAgICB9LFxuXG4gICAgaXNDb21wOiBmdW5jdGlvbiAoY29tcCkge1xuICAgICAgICByZXR1cm4gY29tcCBpbiBjb21wb25lbnRzO1xuICAgIH0sXG5cbiAgICBkZWJ1ZzogZnVuY3Rpb24gKHN0cikge1xuICAgICAgICAvLyBhY2Nlc3MgaW50ZXJuYWwgdmFyaWFibGVzIC0gaGFuZGxlcnMgb3IgZW50aXRpZXNcbiAgICAgICAgaWYgKHN0ciA9PT0gJ2hhbmRsZXJzJykge1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXJzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbnRpdGllcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuc2V0dGluZ3NcbiAgICAgKiBAY2F0ZWdvcnkgQ29yZVxuICAgICAqIE1vZGlmeSB0aGUgaW5uZXIgd29ya2luZ3Mgb2YgQ3JhZnR5IHRocm91Z2ggdGhlIHNldHRpbmdzLlxuICAgICAqL1xuICAgIHNldHRpbmdzOiAoZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc3RhdGVzID0ge30sXG4gICAgICAgICAgICBjYWxsYmFja3MgPSB7fTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLyoqQFxuICAgICAgICAgICAgICogI0NyYWZ0eS5zZXR0aW5ncy5yZWdpc3RlclxuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnNldHRpbmdzXG4gICAgICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkuc2V0dGluZ3MucmVnaXN0ZXIoU3RyaW5nIHNldHRpbmdOYW1lLCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgICAgICAgICAqIEBwYXJhbSBzZXR0aW5nTmFtZSAtIE5hbWUgb2YgdGhlIHNldHRpbmdcbiAgICAgICAgICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIEZ1bmN0aW9uIHRvIGV4ZWN1dGUgd2hlbiB1c2UgbW9kaWZpZXMgc2V0dGluZ1xuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIFVzZSB0aGlzIHRvIHJlZ2lzdGVyIGN1c3RvbSBzZXR0aW5ncy4gQ2FsbGJhY2sgd2lsbCBiZSBleGVjdXRlZCB3aGVuIGBDcmFmdHkuc2V0dGluZ3MubW9kaWZ5YCBpcyB1c2VkLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEBzZWUgQ3JhZnR5LnNldHRpbmdzLm1vZGlmeVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICByZWdpc3RlcjogZnVuY3Rpb24gKHNldHRpbmcsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tzW3NldHRpbmddID0gY2FsbGJhY2s7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKipAXG4gICAgICAgICAgICAgKiAjQ3JhZnR5LnNldHRpbmdzLm1vZGlmeVxuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnNldHRpbmdzXG4gICAgICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkuc2V0dGluZ3MubW9kaWZ5KFN0cmluZyBzZXR0aW5nTmFtZSwgKiB2YWx1ZSlcbiAgICAgICAgICAgICAqIEBwYXJhbSBzZXR0aW5nTmFtZSAtIE5hbWUgb2YgdGhlIHNldHRpbmdcbiAgICAgICAgICAgICAqIEBwYXJhbSB2YWx1ZSAtIFZhbHVlIHRvIHNldCB0aGUgc2V0dGluZyB0b1xuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIE1vZGlmeSBzZXR0aW5ncyB0aHJvdWdoIHRoaXMgbWV0aG9kLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIEBzZWUgQ3JhZnR5LnNldHRpbmdzLnJlZ2lzdGVyLCBDcmFmdHkuc2V0dGluZ3MuZ2V0XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIG1vZGlmeTogZnVuY3Rpb24gKHNldHRpbmcsIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjYWxsYmFja3Nbc2V0dGluZ10pIHJldHVybjtcbiAgICAgICAgICAgICAgICBjYWxsYmFja3Nbc2V0dGluZ10uY2FsbChzdGF0ZXNbc2V0dGluZ10sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBzdGF0ZXNbc2V0dGluZ10gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKkBcbiAgICAgICAgICAgICAqICNDcmFmdHkuc2V0dGluZ3MuZ2V0XG4gICAgICAgICAgICAgKiBAY29tcCBDcmFmdHkuc2V0dGluZ3NcbiAgICAgICAgICAgICAqIEBzaWduIHB1YmxpYyAqIENyYWZ0eS5zZXR0aW5ncy5nZXQoU3RyaW5nIHNldHRpbmdOYW1lKVxuICAgICAgICAgICAgICogQHBhcmFtIHNldHRpbmdOYW1lIC0gTmFtZSBvZiB0aGUgc2V0dGluZ1xuICAgICAgICAgICAgICogQHJldHVybnMgQ3VycmVudCB2YWx1ZSBvZiB0aGUgc2V0dGluZ1xuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgb2YgdGhlIHNldHRpbmcuXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHNlZSBDcmFmdHkuc2V0dGluZ3MucmVnaXN0ZXIsIENyYWZ0eS5zZXR0aW5ncy5nZXRcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoc2V0dGluZykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZXNbc2V0dGluZ107XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSkoKSxcblxuICAgIGNsb25lOiBjbG9uZVxufSk7XG5cbi8qKlxuICogUmV0dXJuIGEgdW5pcXVlIElEXG4gKi9cblxuZnVuY3Rpb24gVUlEKCkge1xuICAgIHZhciBpZCA9IEdVSUQrKztcbiAgICAvL2lmIEdVSUQgaXMgbm90IHVuaXF1ZVxuICAgIGlmIChpZCBpbiBlbnRpdGllcykge1xuICAgICAgICByZXR1cm4gVUlEKCk7IC8vcmVjdXJzZSB1bnRpbCBpdCBpcyB1bmlxdWVcbiAgICB9XG4gICAgcmV0dXJuIGlkO1xufVxuXG4vKipAXG4gKiAjQ3JhZnR5LmNsb25lXG4gKiBAY2F0ZWdvcnkgQ29yZVxuICogQHNpZ24gcHVibGljIE9iamVjdCAuY2xvbmUoT2JqZWN0IG9iailcbiAqIEBwYXJhbSBvYmogLSBhbiBvYmplY3RcbiAqXG4gKiBEZWVwIGNvcHkgKGEuay5hIGNsb25lKSBvZiBhbiBvYmplY3QuXG4gKi9cblxuZnVuY3Rpb24gY2xvbmUob2JqKSB7XG4gICAgaWYgKG9iaiA9PT0gbnVsbCB8fCB0eXBlb2YgKG9iaikgIT0gJ29iamVjdCcpXG4gICAgICAgIHJldHVybiBvYmo7XG5cbiAgICB2YXIgdGVtcCA9IG9iai5jb25zdHJ1Y3RvcigpOyAvLyBjaGFuZ2VkXG5cbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKVxuICAgICAgICB0ZW1wW2tleV0gPSBjbG9uZShvYmpba2V5XSk7XG4gICAgcmV0dXJuIHRlbXA7XG59XG5cbi8vIGV4cG9ydCBDcmFmdHlcbmlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nKSB7IC8vIEFNRFxuICAgIGRlZmluZSgnY3JhZnR5JywgW10sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIENyYWZ0eTtcbiAgICB9KTtcbn0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7IC8vIENvbW1vbkpTXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBDcmFmdHk7XG59XG5cbndpbmRvdy5DcmFmdHkgPSBDcmFmdHk7XG5cbiIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuZGV2aWNlXG4gICAgICogQGNhdGVnb3J5IE1pc2NcbiAgICAgKi9cbiAgICBkZXZpY2U6IHtcbiAgICAgICAgX2RldmljZU9yaWVudGF0aW9uQ2FsbGJhY2s6IGZhbHNlLFxuICAgICAgICBfZGV2aWNlTW90aW9uQ2FsbGJhY2s6IGZhbHNlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgSFRNTDUgRGV2aWNlT3JpZW50YXRpb24gZXZlbnQgcmV0dXJucyB0aHJlZSBwaWVjZXMgb2YgZGF0YTpcbiAgICAgICAgICogICogYWxwaGEgdGhlIGRpcmVjdGlvbiB0aGUgZGV2aWNlIGlzIGZhY2luZyBhY2NvcmRpbmcgdG8gdGhlIGNvbXBhc3NcbiAgICAgICAgICogICogYmV0YSB0aGUgYW5nbGUgaW4gZGVncmVlcyB0aGUgZGV2aWNlIGlzIHRpbHRlZCBmcm9udC10by1iYWNrXG4gICAgICAgICAqICAqIGdhbW1hIHRoZSBhbmdsZSBpbiBkZWdyZWVzIHRoZSBkZXZpY2UgaXMgdGlsdGVkIGxlZnQtdG8tcmlnaHQuXG4gICAgICAgICAqICAqIFRoZSBhbmdsZXMgdmFsdWVzIGluY3JlYXNlIGFzIHlvdSB0aWx0IHRoZSBkZXZpY2UgdG8gdGhlIHJpZ2h0IG9yIHRvd2FyZHMgeW91LlxuICAgICAgICAgKlxuICAgICAgICAgKiBTaW5jZSBGaXJlZm94IHVzZXMgdGhlIE1vek9yaWVudGF0aW9uRXZlbnQgd2hpY2ggcmV0dXJucyBzaW1pbGFyIGRhdGEgYnV0XG4gICAgICAgICAqIHVzaW5nIGRpZmZlcmVudCBwYXJhbWV0ZXJzIGFuZCBhIGRpZmZlcmVudCBtZWFzdXJlbWVudCBzeXN0ZW0sIHdlIHdhbnQgdG9cbiAgICAgICAgICogbm9ybWFsaXplIHRoYXQgYmVmb3JlIHdlIHBhc3MgaXQgdG8gb3VyIF9kZXZpY2VPcmllbnRhdGlvbkNhbGxiYWNrIGZ1bmN0aW9uLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0gZXZlbnREYXRhIEhUTUw1IERldmljZU9yaWVudGF0aW9uIGV2ZW50XG4gICAgICAgICAqL1xuICAgICAgICBfbm9ybWFsaXplRGV2aWNlT3JpZW50YXRpb246IGZ1bmN0aW9uIChldmVudERhdGEpIHtcbiAgICAgICAgICAgIHZhciBkYXRhO1xuICAgICAgICAgICAgaWYgKHdpbmRvdy5EZXZpY2VPcmllbnRhdGlvbkV2ZW50KSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2FtbWEgaXMgdGhlIGxlZnQtdG8tcmlnaHQgdGlsdCBpbiBkZWdyZWVzLCB3aGVyZSByaWdodCBpcyBwb3NpdGl2ZVxuICAgICAgICAgICAgICAgICAgICAndGlsdExSJzogZXZlbnREYXRhLmdhbW1hLFxuICAgICAgICAgICAgICAgICAgICAvLyBiZXRhIGlzIHRoZSBmcm9udC10by1iYWNrIHRpbHQgaW4gZGVncmVlcywgd2hlcmUgZnJvbnQgaXMgcG9zaXRpdmVcbiAgICAgICAgICAgICAgICAgICAgJ3RpbHRGQic6IGV2ZW50RGF0YS5iZXRhLFxuICAgICAgICAgICAgICAgICAgICAvLyBhbHBoYSBpcyB0aGUgY29tcGFzcyBkaXJlY3Rpb24gdGhlIGRldmljZSBpcyBmYWNpbmcgaW4gZGVncmVlc1xuICAgICAgICAgICAgICAgICAgICAnZGlyJzogZXZlbnREYXRhLmFscGhhLFxuICAgICAgICAgICAgICAgICAgICAvLyBkZXZpY2VvcmllbnRhdGlvbiBkb2VzIG5vdCBwcm92aWRlIHRoaXMgZGF0YVxuICAgICAgICAgICAgICAgICAgICAnbW90VUQnOiBudWxsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAod2luZG93Lk9yaWVudGF0aW9uRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBkYXRhID0ge1xuICAgICAgICAgICAgICAgICAgICAvLyB4IGlzIHRoZSBsZWZ0LXRvLXJpZ2h0IHRpbHQgZnJvbSAtMSB0byArMSwgc28gd2UgbmVlZCB0byBjb252ZXJ0IHRvIGRlZ3JlZXNcbiAgICAgICAgICAgICAgICAgICAgJ3RpbHRMUic6IGV2ZW50RGF0YS54ICogOTAsXG4gICAgICAgICAgICAgICAgICAgIC8vIHkgaXMgdGhlIGZyb250LXRvLWJhY2sgdGlsdCBmcm9tIC0xIHRvICsxLCBzbyB3ZSBuZWVkIHRvIGNvbnZlcnQgdG8gZGVncmVlc1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSBhbHNvIG5lZWQgdG8gaW52ZXJ0IHRoZSB2YWx1ZSBzbyB0aWx0aW5nIHRoZSBkZXZpY2UgdG93YXJkcyB1cyAoZm9yd2FyZClcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVzdWx0cyBpbiBhIHBvc2l0aXZlIHZhbHVlLlxuICAgICAgICAgICAgICAgICAgICAndGlsdEZCJzogZXZlbnREYXRhLnkgKiAtOTAsXG4gICAgICAgICAgICAgICAgICAgIC8vIE1vek9yaWVudGF0aW9uIGRvZXMgbm90IHByb3ZpZGUgdGhpcyBkYXRhXG4gICAgICAgICAgICAgICAgICAgICdkaXInOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAvLyB6IGlzIHRoZSB2ZXJ0aWNhbCBhY2NlbGVyYXRpb24gb2YgdGhlIGRldmljZVxuICAgICAgICAgICAgICAgICAgICAnbW90VUQnOiBldmVudERhdGEuelxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIENyYWZ0eS5kZXZpY2UuX2RldmljZU9yaWVudGF0aW9uQ2FsbGJhY2soZGF0YSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSBldmVudERhdGEgSFRNTDUgRGV2aWNlTW90aW9uIGV2ZW50XG4gICAgICAgICAqL1xuICAgICAgICBfbm9ybWFsaXplRGV2aWNlTW90aW9uOiBmdW5jdGlvbiAoZXZlbnREYXRhKSB7XG4gICAgICAgICAgICB2YXIgYWNjZWxlcmF0aW9uID0gZXZlbnREYXRhLmFjY2VsZXJhdGlvbkluY2x1ZGluZ0dyYXZpdHksXG4gICAgICAgICAgICAgICAgZmFjaW5nVXAgPSAoYWNjZWxlcmF0aW9uLnogPiAwKSA/ICsxIDogLTE7XG5cbiAgICAgICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgICAgIC8vIEdyYWIgdGhlIGFjY2VsZXJhdGlvbiBpbmNsdWRpbmcgZ3Jhdml0eSBmcm9tIHRoZSByZXN1bHRzXG4gICAgICAgICAgICAgICAgJ2FjY2VsZXJhdGlvbic6IGFjY2VsZXJhdGlvbixcbiAgICAgICAgICAgICAgICAncmF3QWNjZWxlcmF0aW9uJzogXCJbXCIgKyBNYXRoLnJvdW5kKGFjY2VsZXJhdGlvbi54KSArIFwiLCBcIiArIE1hdGgucm91bmQoYWNjZWxlcmF0aW9uLnkpICsgXCIsIFwiICsgTWF0aC5yb3VuZChhY2NlbGVyYXRpb24ueikgKyBcIl1cIixcbiAgICAgICAgICAgICAgICAvLyBaIGlzIHRoZSBhY2NlbGVyYXRpb24gaW4gdGhlIFogYXhpcywgYW5kIGlmIHRoZSBkZXZpY2UgaXMgZmFjaW5nIHVwIG9yIGRvd25cbiAgICAgICAgICAgICAgICAnZmFjaW5nVXAnOiBmYWNpbmdVcCxcbiAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IHRoZSB2YWx1ZSBmcm9tIGFjY2VsZXJhdGlvbiB0byBkZWdyZWVzIGFjY2VsZXJhdGlvbi54fHkgaXMgdGhlXG4gICAgICAgICAgICAgICAgLy8gYWNjZWxlcmF0aW9uIGFjY29yZGluZyB0byBncmF2aXR5LCB3ZSdsbCBhc3N1bWUgd2UncmUgb24gRWFydGggYW5kIGRpdmlkZVxuICAgICAgICAgICAgICAgIC8vIGJ5IDkuODEgKGVhcnRoIGdyYXZpdHkpIHRvIGdldCBhIHBlcmNlbnRhZ2UgdmFsdWUsIGFuZCB0aGVuIG11bHRpcGx5IHRoYXRcbiAgICAgICAgICAgICAgICAvLyBieSA5MCB0byBjb252ZXJ0IHRvIGRlZ3JlZXMuXG4gICAgICAgICAgICAgICAgJ3RpbHRMUic6IE1hdGgucm91bmQoKChhY2NlbGVyYXRpb24ueCkgLyA5LjgxKSAqIC05MCksXG4gICAgICAgICAgICAgICAgJ3RpbHRGQic6IE1hdGgucm91bmQoKChhY2NlbGVyYXRpb24ueSArIDkuODEpIC8gOS44MSkgKiA5MCAqIGZhY2luZ1VwKVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgQ3JhZnR5LmRldmljZS5fZGV2aWNlTW90aW9uQ2FsbGJhY2soZGF0YSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmRldmljZS5kZXZpY2VPcmllbnRhdGlvblxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuZGV2aWNlXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBDcmFmdHkuZGV2aWNlLmRldmljZU9yaWVudGF0aW9uKEZ1bmN0aW9uIGNhbGxiYWNrKVxuICAgICAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBDYWxsYmFjayBtZXRob2QgZXhlY3V0ZWQgb25jZSBhcyBzb29uIGFzIGRldmljZSBvcmllbnRhdGlvbiBpcyBjaGFuZ2VcbiAgICAgICAgICpcbiAgICAgICAgICogRG8gc29tZXRoaW5nIHdpdGggbm9ybWFsaXplZCBkZXZpY2Ugb3JpZW50YXRpb24gZGF0YTpcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHtcbiAgICAgICAgICogICAndGlsdExSJyAgICA6ICAgJ2dhbW1hIHRoZSBhbmdsZSBpbiBkZWdyZWVzIHRoZSBkZXZpY2UgaXMgdGlsdGVkIGxlZnQtdG8tcmlnaHQuJyxcbiAgICAgICAgICogICAndGlsdEZCJyAgICA6ICAgJ2JldGEgdGhlIGFuZ2xlIGluIGRlZ3JlZXMgdGhlIGRldmljZSBpcyB0aWx0ZWQgZnJvbnQtdG8tYmFjaycsXG4gICAgICAgICAqICAgJ2RpcicgICAgICAgOiAgICdhbHBoYSB0aGUgZGlyZWN0aW9uIHRoZSBkZXZpY2UgaXMgZmFjaW5nIGFjY29yZGluZyB0byB0aGUgY29tcGFzcycsXG4gICAgICAgICAqICAgJ21vdFVEJyAgICAgOiAgICdUaGUgYW5nbGVzIHZhbHVlcyBpbmNyZWFzZSBhcyB5b3UgdGlsdCB0aGUgZGV2aWNlIHRvIHRoZSByaWdodCBvciB0b3dhcmRzIHlvdS4nXG4gICAgICAgICAqIH1cbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiAvLyBHZXQgRGV2aWNlT3JpZW50YXRpb24gZXZlbnQgbm9ybWFsaXplZCBkYXRhLlxuICAgICAgICAgKiBDcmFmdHkuZGV2aWNlLmRldmljZU9yaWVudGF0aW9uKGZ1bmN0aW9uKGRhdGEpe1xuICAgICAgICAgKiAgICAgY29uc29sZS5sb2coJ2RhdGEudGlsdExSIDogJytNYXRoLnJvdW5kKGRhdGEudGlsdExSKSsnLCBkYXRhLnRpbHRGQiA6ICcrTWF0aC5yb3VuZChkYXRhLnRpbHRGQikrJywgZGF0YS5kaXIgOiAnK01hdGgucm91bmQoZGF0YS5kaXIpKycsIGRhdGEubW90VUQgOiAnK2RhdGEubW90VUQrJycpO1xuICAgICAgICAgKiB9KTtcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqIFNlZSBicm93c2VyIHN1cHBvcnQgYXQgaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9ZGV2aWNlIG9yaWVudGF0aW9uLlxuICAgICAgICAgKi9cbiAgICAgICAgZGV2aWNlT3JpZW50YXRpb246IGZ1bmN0aW9uIChmdW5jKSB7XG4gICAgICAgICAgICB0aGlzLl9kZXZpY2VPcmllbnRhdGlvbkNhbGxiYWNrID0gZnVuYztcbiAgICAgICAgICAgIGlmIChDcmFmdHkuc3VwcG9ydC5kZXZpY2VvcmllbnRhdGlvbikge1xuICAgICAgICAgICAgICAgIGlmICh3aW5kb3cuRGV2aWNlT3JpZW50YXRpb25FdmVudCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBMaXN0ZW4gZm9yIHRoZSBkZXZpY2VvcmllbnRhdGlvbiBldmVudCBhbmQgaGFuZGxlIERldmljZU9yaWVudGF0aW9uRXZlbnQgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS5hZGRFdmVudCh0aGlzLCB3aW5kb3csICdkZXZpY2VvcmllbnRhdGlvbicsIHRoaXMuX25vcm1hbGl6ZURldmljZU9yaWVudGF0aW9uKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHdpbmRvdy5PcmllbnRhdGlvbkV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIExpc3RlbiBmb3IgdGhlIE1vek9yaWVudGF0aW9uIGV2ZW50IGFuZCBoYW5kbGUgT3JpZW50YXRpb25EYXRhIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgd2luZG93LCAnTW96T3JpZW50YXRpb24nLCB0aGlzLl9ub3JtYWxpemVEZXZpY2VPcmllbnRhdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5kZXZpY2UuZGV2aWNlTW90aW9uXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5kZXZpY2VcbiAgICAgICAgICogQHNpZ24gcHVibGljIENyYWZ0eS5kZXZpY2UuZGV2aWNlTW90aW9uKEZ1bmN0aW9uIGNhbGxiYWNrKVxuICAgICAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBDYWxsYmFjayBtZXRob2QgZXhlY3V0ZWQgb25jZSBhcyBzb29uIGFzIGRldmljZSBtb3Rpb24gaXMgY2hhbmdlXG4gICAgICAgICAqXG4gICAgICAgICAqIERvIHNvbWV0aGluZyB3aXRoIG5vcm1hbGl6ZWQgZGV2aWNlIG1vdGlvbiBkYXRhOlxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICoge1xuICAgICAgICAgKiAgICAgJ2FjY2VsZXJhdGlvbicgOiAnIEdyYWIgdGhlIGFjY2VsZXJhdGlvbiBpbmNsdWRpbmcgZ3Jhdml0eSBmcm9tIHRoZSByZXN1bHRzJyxcbiAgICAgICAgICogICAgICdyYXdBY2NlbGVyYXRpb24nIDogJ0Rpc3BsYXkgdGhlIHJhdyBhY2NlbGVyYXRpb24gZGF0YScsXG4gICAgICAgICAqICAgICAnZmFjaW5nVXAnIDogJ1ogaXMgdGhlIGFjY2VsZXJhdGlvbiBpbiB0aGUgWiBheGlzLCBhbmQgaWYgdGhlIGRldmljZSBpcyBmYWNpbmcgdXAgb3IgZG93bicsXG4gICAgICAgICAqICAgICAndGlsdExSJyA6ICdDb252ZXJ0IHRoZSB2YWx1ZSBmcm9tIGFjY2VsZXJhdGlvbiB0byBkZWdyZWVzLiBhY2NlbGVyYXRpb24ueCBpcyB0aGUgYWNjZWxlcmF0aW9uIGFjY29yZGluZyB0byBncmF2aXR5LCB3ZSdsbCBhc3N1bWUgd2UncmUgb24gRWFydGggYW5kIGRpdmlkZSBieSA5LjgxIChlYXJ0aCBncmF2aXR5KSB0byBnZXQgYSBwZXJjZW50YWdlIHZhbHVlLCBhbmQgdGhlbiBtdWx0aXBseSB0aGF0IGJ5IDkwIHRvIGNvbnZlcnQgdG8gZGVncmVlcy4nLFxuICAgICAgICAgKiAgICAgJ3RpbHRGQicgOiAnQ29udmVydCB0aGUgdmFsdWUgZnJvbSBhY2NlbGVyYXRpb24gdG8gZGVncmVlcy4nXG4gICAgICAgICAqIH1cbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiAvLyBHZXQgRGV2aWNlTW90aW9uIGV2ZW50IG5vcm1hbGl6ZWQgZGF0YS5cbiAgICAgICAgICogQ3JhZnR5LmRldmljZS5kZXZpY2VNb3Rpb24oZnVuY3Rpb24oZGF0YSl7XG4gICAgICAgICAqICAgICBjb25zb2xlLmxvZygnZGF0YS5tb0FjY2VsIDogJytkYXRhLnJhd0FjY2VsZXJhdGlvbisnLCBkYXRhLm1vQ2FsY1RpbHRMUiA6ICcrTWF0aC5yb3VuZChkYXRhLnRpbHRMUikrJywgZGF0YS5tb0NhbGNUaWx0RkIgOiAnK01hdGgucm91bmQoZGF0YS50aWx0RkIpKycnKTtcbiAgICAgICAgICogfSk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKlxuICAgICAgICAgKiBTZWUgYnJvd3NlciBzdXBwb3J0IGF0IGh0dHA6Ly9jYW5pdXNlLmNvbS8jc2VhcmNoPW1vdGlvbi5cbiAgICAgICAgICovXG4gICAgICAgIGRldmljZU1vdGlvbjogZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgIHRoaXMuX2RldmljZU1vdGlvbkNhbGxiYWNrID0gZnVuYztcbiAgICAgICAgICAgIGlmIChDcmFmdHkuc3VwcG9ydC5kZXZpY2Vtb3Rpb24pIHtcbiAgICAgICAgICAgICAgICBpZiAod2luZG93LkRldmljZU1vdGlvbkV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIExpc3RlbiBmb3IgdGhlIGRldmljZW1vdGlvbiBldmVudCBhbmQgaGFuZGxlIERldmljZU1vdGlvbkV2ZW50IG9iamVjdFxuICAgICAgICAgICAgICAgICAgICBDcmFmdHkuYWRkRXZlbnQodGhpcywgd2luZG93LCAnZGV2aWNlbW90aW9uJywgdGhpcy5fbm9ybWFsaXplRGV2aWNlTW90aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59KTtcbiIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuZGlhbW9uZElzb1xuICAgICAqIEBjYXRlZ29yeSAyRFxuICAgICAqIFBsYWNlIGVudGl0aWVzIGluIGEgNDVkZWcgZGlhbW9uZCBpc29tZXRyaWMgZmFzaGlvbi4gSXQgaXMgc2ltaWxhciB0byBpc29tZXRyaWMgYnV0IGhhcyBhbm90aGVyIGdyaWQgbG9jYXRpb25zXG4gICAgICovXG4gICAgZGlhbW9uZElzbzoge1xuICAgICAgICBfdGlsZToge1xuICAgICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgICAgICByOiAwXG4gICAgICAgIH0sXG4gICAgICAgIF9tYXA6IHtcbiAgICAgICAgICAgIHdpZHRoOiAwLFxuICAgICAgICAgICAgaGVpZ2h0OiAwLFxuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDBcbiAgICAgICAgfSxcblxuICAgICAgICBfb3JpZ2luOiB7XG4gICAgICAgICAgICB4OiAwLFxuICAgICAgICAgICAgeTogMFxuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuZGlhbW9uZElzby5pbml0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5kaWFtb25kSXNvXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5kaWFtb25kSXNvLmluaXQoTnVtYmVyIHRpbGVXaWR0aCxOdW1iZXIgdGlsZUhlaWdodCxOdW1iZXIgbWFwV2lkdGgsTnVtYmVyIG1hcEhlaWdodClcbiAgICAgICAgICogQHBhcmFtIHRpbGVXaWR0aCAtIFRoZSBzaXplIG9mIGJhc2UgdGlsZSB3aWR0aCBpbiBQaXhlbFxuICAgICAgICAgKiBAcGFyYW0gdGlsZUhlaWdodCAtIFRoZSBzaXplIG9mIGJhc2UgdGlsZSBoZWlnaHQgaW4gUGl4ZWxcbiAgICAgICAgICogQHBhcmFtIG1hcFdpZHRoIC0gVGhlIHdpZHRoIG9mIHdob2xlIG1hcCBpbiBUaWxlc1xuICAgICAgICAgKiBAcGFyYW0gbWFwSGVpZ2h0IC0gVGhlIGhlaWdodCBvZiB3aG9sZSBtYXAgaW4gVGlsZXNcbiAgICAgICAgICpcbiAgICAgICAgICogTWV0aG9kIHVzZWQgdG8gaW5pdGlhbGl6ZSB0aGUgc2l6ZSBvZiB0aGUgaXNvbWV0cmljIHBsYWNlbWVudC5cbiAgICAgICAgICogUmVjb21tZW5kZWQgdG8gdXNlIGEgc2l6ZSBhbHVlcyBpbiB0aGUgcG93ZXIgb2YgYDJgICgxMjgsIDY0IG9yIDMyKS5cbiAgICAgICAgICogVGhpcyBtYWtlcyBpdCBlYXN5IHRvIGNhbGN1bGF0ZSBwb3NpdGlvbnMgYW5kIGltcGxlbWVudCB6b29taW5nLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogdmFyIGlzbyA9IENyYWZ0eS5kaWFtb25kSXNvLmluaXQoNjQsMTI4LDIwLDIwKTtcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqIEBzZWUgQ3JhZnR5LmRpYW1vbmRJc28ucGxhY2VcbiAgICAgICAgICovXG4gICAgICAgIGluaXQ6IGZ1bmN0aW9uICh0dywgdGgsIG13LCBtaCkge1xuICAgICAgICAgICAgdGhpcy5fdGlsZS53aWR0aCA9IHBhcnNlSW50KHR3LCAxMCk7XG4gICAgICAgICAgICB0aGlzLl90aWxlLmhlaWdodCA9IHBhcnNlSW50KHRoLCAxMCkgfHwgcGFyc2VJbnQodHcsIDEwKSAvIDI7XG4gICAgICAgICAgICB0aGlzLl90aWxlLnIgPSB0aGlzLl90aWxlLndpZHRoIC8gdGhpcy5fdGlsZS5oZWlnaHQ7XG5cbiAgICAgICAgICAgIHRoaXMuX21hcC53aWR0aCA9IHBhcnNlSW50KG13LCAxMCk7XG4gICAgICAgICAgICB0aGlzLl9tYXAuaGVpZ2h0ID0gcGFyc2VJbnQobWgsIDEwKSB8fCBwYXJzZUludChtdywgMTApO1xuXG4gICAgICAgICAgICB0aGlzLl9vcmlnaW4ueCA9IHRoaXMuX21hcC5oZWlnaHQgKiB0aGlzLl90aWxlLndpZHRoIC8gMjtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuZGlhbW9uZElzby5wbGFjZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuZGlhbW9uZElzb1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuZGlhbW9uZElzby5wbGFjZShFbnRpdHkgdGlsZSxOdW1iZXIgeCwgTnVtYmVyIHksIE51bWJlciBsYXllcilcbiAgICAgICAgICogQHBhcmFtIHggLSBUaGUgYHhgIHBvc2l0aW9uIHRvIHBsYWNlIHRoZSB0aWxlXG4gICAgICAgICAqIEBwYXJhbSB5IC0gVGhlIGB5YCBwb3NpdGlvbiB0byBwbGFjZSB0aGUgdGlsZVxuICAgICAgICAgKiBAcGFyYW0gbGF5ZXIgLSBUaGUgYHpgIHBvc2l0aW9uIHRvIHBsYWNlIHRoZSB0aWxlIChjYWxjdWxhdGVkIGJ5IHkgcG9zaXRpb24gKiBsYXllcilcbiAgICAgICAgICogQHBhcmFtIHRpbGUgLSBUaGUgZW50aXR5IHRoYXQgc2hvdWxkIGJlIHBvc2l0aW9uIGluIHRoZSBpc29tZXRyaWMgZmFzaGlvblxuICAgICAgICAgKlxuICAgICAgICAgKiBVc2UgdGhpcyBtZXRob2QgdG8gcGxhY2UgYW4gZW50aXR5IGluIGFuIGlzb21ldHJpYyBncmlkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogdmFyIGlzbyA9IENyYWZ0eS5kaWFtb25kSXNvLmluaXQoNjQsMTI4LDIwLDIwKTtcbiAgICAgICAgICogaXNvcy5wbGFjZShDcmFmdHkuZSgnMkQsIERPTSwgQ29sb3InKS5jb2xvcigncmVkJykuYXR0cih7dzoxMjgsIGg6MTI4fSksMSwxLDIpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICpcbiAgICAgICAgICogQHNlZSBDcmFmdHkuZGlhbW9uZElzby5zaXplXG4gICAgICAgICAqL1xuICAgICAgICBwbGFjZTogZnVuY3Rpb24gKG9iaiwgeCwgeSwgbGF5ZXIpIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnBvczJweCh4LCB5KTtcbiAgICAgICAgICAgIGlmICghbGF5ZXIpIGxheWVyID0gMTtcbiAgICAgICAgICAgIHZhciBtYXJnaW5YID0gMCxcbiAgICAgICAgICAgICAgICBtYXJnaW5ZID0gMDtcbiAgICAgICAgICAgIGlmIChvYmouX19tYXJnaW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG1hcmdpblggPSBvYmouX19tYXJnaW5bMF07XG4gICAgICAgICAgICAgICAgbWFyZ2luWSA9IG9iai5fX21hcmdpblsxXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb2JqLnggPSBwb3MubGVmdCArIChtYXJnaW5YKTtcbiAgICAgICAgICAgIG9iai55ID0gKHBvcy50b3AgKyBtYXJnaW5ZKSAtIG9iai5oO1xuICAgICAgICAgICAgb2JqLnogPSAocG9zLnRvcCkgKiBsYXllcjtcblxuXG4gICAgICAgIH0sXG4gICAgICAgIGNlbnRlckF0OiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMucG9zMnB4KHgsIHkpO1xuICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnggPSAtcG9zLmxlZnQgKyBDcmFmdHkudmlld3BvcnQud2lkdGggLyAyIC0gdGhpcy5fdGlsZS53aWR0aDtcbiAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC55ID0gLXBvcy50b3AgKyBDcmFmdHkudmlld3BvcnQuaGVpZ2h0IC8gMjtcblxuICAgICAgICB9LFxuICAgICAgICBhcmVhOiBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gICAgICAgICAgICBpZiAoIW9mZnNldCkgb2Zmc2V0ID0gMDtcbiAgICAgICAgICAgIC8vY2FsY3VsYXRlIHRoZSBjb3JuZXJzXG4gICAgICAgICAgICB2YXIgdnAgPSBDcmFmdHkudmlld3BvcnQucmVjdCgpO1xuICAgICAgICAgICAgdmFyIG93ID0gb2Zmc2V0ICogdGhpcy5fdGlsZS53aWR0aDtcbiAgICAgICAgICAgIHZhciBvaCA9IG9mZnNldCAqIHRoaXMuX3RpbGUuaGVpZ2h0O1xuICAgICAgICAgICAgdnAuX3ggLT0gKHRoaXMuX3RpbGUud2lkdGggLyAyICsgb3cpO1xuICAgICAgICAgICAgdnAuX3kgLT0gKHRoaXMuX3RpbGUuaGVpZ2h0IC8gMiArIG9oKTtcbiAgICAgICAgICAgIHZwLl93ICs9ICh0aGlzLl90aWxlLndpZHRoIC8gMiArIG93KTtcbiAgICAgICAgICAgIHZwLl9oICs9ICh0aGlzLl90aWxlLmhlaWdodCAvIDIgKyBvaCk7XG4gICAgICAgICAgICAvKiAgQ3JhZnR5LnZpZXdwb3J0LnggPSAtdnAuX3g7XG4gICAgICAgICAgICBDcmFmdHkudmlld3BvcnQueSA9IC12cC5feTtcbiAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC53aWR0aCA9IHZwLl93O1xuICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCA9IHZwLl9oOyAgICovXG5cbiAgICAgICAgICAgIHZhciBncmlkID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciB5ID0gdnAuX3ksIHlsID0gKHZwLl95ICsgdnAuX2gpOyB5IDwgeWw7IHkgKz0gdGhpcy5fdGlsZS5oZWlnaHQgLyAyKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgeCA9IHZwLl94LCB4bCA9ICh2cC5feCArIHZwLl93KTsgeCA8IHhsOyB4ICs9IHRoaXMuX3RpbGUud2lkdGggLyAyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLnB4MnBvcyh4LCB5KTtcbiAgICAgICAgICAgICAgICAgICAgZ3JpZC5wdXNoKFt+fnJvdy54LCB+fnJvdy55XSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGdyaWQ7XG4gICAgICAgIH0sXG4gICAgICAgIHBvczJweDogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGVmdDogKCh4IC0geSkgKiB0aGlzLl90aWxlLndpZHRoIC8gMiArIHRoaXMuX29yaWdpbi54KSxcbiAgICAgICAgICAgICAgICB0b3A6ICgoeCArIHkpICogdGhpcy5fdGlsZS5oZWlnaHQgLyAyKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICAgICAgcHgycG9zOiBmdW5jdGlvbiAobGVmdCwgdG9wKSB7XG4gICAgICAgICAgICB2YXIgeCA9IChsZWZ0IC0gdGhpcy5fb3JpZ2luLngpIC8gdGhpcy5fdGlsZS5yO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiAoKHRvcCArIHgpIC8gdGhpcy5fdGlsZS5oZWlnaHQpLFxuICAgICAgICAgICAgICAgIHk6ICgodG9wIC0geCkgLyB0aGlzLl90aWxlLmhlaWdodClcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9seWdvbjogZnVuY3Rpb24gKG9iaikge1xuXG4gICAgICAgICAgICBvYmoucmVxdWlyZXMoXCJDb2xsaXNpb25cIik7XG4gICAgICAgICAgICB2YXIgbWFyZ2luWCA9IDAsXG4gICAgICAgICAgICAgICAgbWFyZ2luWSA9IDA7XG4gICAgICAgICAgICBpZiAob2JqLl9fbWFyZ2luICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBtYXJnaW5YID0gb2JqLl9fbWFyZ2luWzBdO1xuICAgICAgICAgICAgICAgIG1hcmdpblkgPSBvYmouX19tYXJnaW5bMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgcG9pbnRzID0gW1xuICAgICAgICAgICAgICAgIFttYXJnaW5YIC0gMCwgb2JqLmggLSBtYXJnaW5ZIC0gdGhpcy5fdGlsZS5oZWlnaHQgLyAyXSxcbiAgICAgICAgICAgICAgICBbbWFyZ2luWCAtIHRoaXMuX3RpbGUud2lkdGggLyAyLCBvYmouaCAtIG1hcmdpblkgLSAwXSxcbiAgICAgICAgICAgICAgICBbbWFyZ2luWCAtIHRoaXMuX3RpbGUud2lkdGgsIG9iai5oIC0gbWFyZ2luWSAtIHRoaXMuX3RpbGUuaGVpZ2h0IC8gMl0sXG4gICAgICAgICAgICAgICAgW21hcmdpblggLSB0aGlzLl90aWxlLndpZHRoIC8gMiwgb2JqLmggLSBtYXJnaW5ZIC0gdGhpcy5fdGlsZS5oZWlnaHRdXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgdmFyIHBvbHkgPSBuZXcgQ3JhZnR5LnBvbHlnb24ocG9pbnRzKTtcbiAgICAgICAgICAgIHJldHVybiBwb2x5O1xuXG4gICAgICAgIH1cblxuICAgIH1cbn0pOyIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuLyoqQFxuICogI0NvbG9yXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqIERyYXcgYSBzb2xpZCBjb2xvciBmb3IgdGhlIGVudGl0eVxuICovXG5DcmFmdHkuYyhcIkNvbG9yXCIsIHtcbiAgICBfY29sb3I6IFwiXCIsXG4gICAgcmVhZHk6IHRydWUsXG5cbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuYmluZChcIkRyYXdcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIGlmIChlLnR5cGUgPT09IFwiRE9NXCIpIHtcbiAgICAgICAgICAgICAgICBlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuX2NvbG9yO1xuICAgICAgICAgICAgICAgIGUuc3R5bGUubGluZUhlaWdodCA9IDA7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gXCJjYW52YXNcIikge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9jb2xvcikgZS5jdHguZmlsbFN0eWxlID0gdGhpcy5fY29sb3I7XG4gICAgICAgICAgICAgICAgZS5jdHguZmlsbFJlY3QoZS5wb3MuX3gsIGUucG9zLl95LCBlLnBvcy5fdywgZS5wb3MuX2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuY29sb3JcbiAgICAgKiBAY29tcCBDb2xvclxuICAgICAqIEB0cmlnZ2VyIEludmFsaWRhdGUgLSB3aGVuIHRoZSBjb2xvciBjaGFuZ2VzXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLmNvbG9yKFN0cmluZyBjb2xvcilcbiAgICAgKiBAc2lnbiBwdWJsaWMgU3RyaW5nIC5jb2xvcigpXG4gICAgICogQHBhcmFtIGNvbG9yIC0gQ29sb3Igb2YgdGhlIHJlY3RhbmdsZVxuICAgICAqIFdpbGwgY3JlYXRlIGEgcmVjdGFuZ2xlIG9mIHNvbGlkIGNvbG9yIGZvciB0aGUgZW50aXR5LCBvciByZXR1cm4gdGhlIGNvbG9yIGlmIG5vIGFyZ3VtZW50IGlzIGdpdmVuLlxuICAgICAqXG4gICAgICogVGhlIGFyZ3VtZW50IG11c3QgYmUgYSBjb2xvciByZWFkYWJsZSBkZXBlbmRpbmcgb24gd2hpY2ggYnJvd3NlciB5b3VcbiAgICAgKiBjaG9vc2UgdG8gc3VwcG9ydC5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBgXG4gICAgICogQ3JhZnR5LmUoXCIyRCwgRE9NLCBDb2xvclwiKVxuICAgICAqICAgIC5jb2xvcihcIiM5Njk2OTZcIik7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgY29sb3I6IGZ1bmN0aW9uIChjb2xvcikge1xuICAgICAgICBpZiAoIWNvbG9yKSByZXR1cm4gdGhpcy5fY29sb3I7XG4gICAgICAgIHRoaXMuX2NvbG9yID0gY29sb3I7XG4gICAgICAgIHRoaXMudHJpZ2dlcihcIkludmFsaWRhdGVcIik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjVGludFxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBTaW1pbGFyIHRvIENvbG9yIGJ5IGFkZGluZyBhbiBvdmVybGF5IG9mIHNlbWktdHJhbnNwYXJlbnQgY29sb3IuXG4gKlxuICogKk5vdGU6IEN1cnJlbnRseSBvbmx5IHdvcmtzIGZvciBDYW52YXMqXG4gKi9cbkNyYWZ0eS5jKFwiVGludFwiLCB7XG4gICAgX2NvbG9yOiBudWxsLFxuICAgIF9zdHJlbmd0aDogMS4wLFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZHJhdyA9IGZ1bmN0aW9uIGQoZSkge1xuICAgICAgICAgICAgdmFyIGNvbnRleHQgPSBlLmN0eCB8fCBDcmFmdHkuY2FudmFzLmNvbnRleHQ7XG5cbiAgICAgICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gdGhpcy5fY29sb3IgfHwgXCJyZ2JhKDAsMCwwLCAwKVwiO1xuICAgICAgICAgICAgY29udGV4dC5maWxsUmVjdChlLnBvcy5feCwgZS5wb3MuX3ksIGUucG9zLl93LCBlLnBvcy5faCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5iaW5kKFwiRHJhd1wiLCBkcmF3KS5iaW5kKFwiUmVtb3ZlQ29tcG9uZW50XCIsIGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgICAgaWYgKGlkID09PSBcIlRpbnRcIikgdGhpcy51bmJpbmQoXCJEcmF3XCIsIGRyYXcpO1xuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMudGludFxuICAgICAqIEBjb21wIFRpbnRcbiAgICAgKiBAdHJpZ2dlciBJbnZhbGlkYXRlIC0gd2hlbiB0aGUgdGludCBpcyBhcHBsaWVkXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnRpbnQoU3RyaW5nIGNvbG9yLCBOdW1iZXIgc3RyZW5ndGgpXG4gICAgICogQHBhcmFtIGNvbG9yIC0gVGhlIGNvbG9yIGluIGhleGFkZWNpbWFsXG4gICAgICogQHBhcmFtIHN0cmVuZ3RoIC0gTGV2ZWwgb2Ygb3BhY2l0eVxuICAgICAqXG4gICAgICogTW9kaWZ5IHRoZSBjb2xvciBhbmQgbGV2ZWwgb3BhY2l0eSB0byBnaXZlIGEgdGludCBvbiB0aGUgZW50aXR5LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIjJELCBDYW52YXMsIFRpbnRcIilcbiAgICAgKiAgICAudGludChcIiM5Njk2OTZcIiwgMC4zKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICB0aW50OiBmdW5jdGlvbiAoY29sb3IsIHN0cmVuZ3RoKSB7XG4gICAgICAgIHRoaXMuX3N0cmVuZ3RoID0gc3RyZW5ndGg7XG4gICAgICAgIHRoaXMuX2NvbG9yID0gQ3JhZnR5LnRvUkdCKGNvbG9yLCB0aGlzLl9zdHJlbmd0aCk7XG5cbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiSW52YWxpZGF0ZVwiKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufSk7XG5cbi8qKkBcbiAqICNJbWFnZVxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBEcmF3IGFuIGltYWdlIHdpdGggb3Igd2l0aG91dCByZXBlYXRpbmcgKHRpbGluZykuXG4gKi9cbkNyYWZ0eS5jKFwiSW1hZ2VcIiwge1xuICAgIF9yZXBlYXQ6IFwicmVwZWF0XCIsXG4gICAgcmVhZHk6IGZhbHNlLFxuXG4gICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgZHJhdyA9IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBpZiAoZS50eXBlID09PSBcImNhbnZhc1wiKSB7XG4gICAgICAgICAgICAgICAgLy9za2lwIGlmIG5vIGltYWdlXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnJlYWR5IHx8ICF0aGlzLl9wYXR0ZXJuKSByZXR1cm47XG5cbiAgICAgICAgICAgICAgICB2YXIgY29udGV4dCA9IGUuY3R4O1xuXG4gICAgICAgICAgICAgICAgY29udGV4dC5maWxsU3R5bGUgPSB0aGlzLl9wYXR0ZXJuO1xuXG4gICAgICAgICAgICAgICAgY29udGV4dC5zYXZlKCk7XG4gICAgICAgICAgICAgICAgY29udGV4dC50cmFuc2xhdGUoZS5wb3MuX3gsIGUucG9zLl95KTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LmZpbGxSZWN0KDAsIDAsIHRoaXMuX3csIHRoaXMuX2gpO1xuICAgICAgICAgICAgICAgIGNvbnRleHQucmVzdG9yZSgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlLnR5cGUgPT09IFwiRE9NXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fX2ltYWdlKSB7XG4gICAgICAgICAgICAgICAgICBlLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IFwidXJsKFwiICsgdGhpcy5fX2ltYWdlICsgXCIpXCI7XG4gICAgICAgICAgICAgICAgICBlLnN0eWxlLmJhY2tncm91bmRSZXBlYXQgPSB0aGlzLl9yZXBlYXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuYmluZChcIkRyYXdcIiwgZHJhdykuYmluZChcIlJlbW92ZUNvbXBvbmVudFwiLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgIGlmIChpZCA9PT0gXCJJbWFnZVwiKSB0aGlzLnVuYmluZChcIkRyYXdcIiwgZHJhdyk7XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5pbWFnZVxuICAgICAqIEBjb21wIEltYWdlXG4gICAgICogQHRyaWdnZXIgSW52YWxpZGF0ZSAtIHdoZW4gdGhlIGltYWdlIGlzIGxvYWRlZFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5pbWFnZShTdHJpbmcgdXJsWywgU3RyaW5nIHJlcGVhdF0pXG4gICAgICogQHBhcmFtIHVybCAtIFVSTCBvZiB0aGUgaW1hZ2VcbiAgICAgKiBAcGFyYW0gcmVwZWF0IC0gSWYgdGhlIGltYWdlIHNob3VsZCBiZSByZXBlYXRlZCB0byBmaWxsIHRoZSBlbnRpdHkuXG4gICAgICpcbiAgICAgKiBEcmF3IHNwZWNpZmllZCBpbWFnZS4gUmVwZWF0IGZvbGxvd3MgQ1NTIHN5bnRheCAoYFwibm8tcmVwZWF0XCIsIFwicmVwZWF0XCIsIFwicmVwZWF0LXhcIiwgXCJyZXBlYXQteVwiYCk7XG4gICAgICpcbiAgICAgKiAqTm90ZTogRGVmYXVsdCByZXBlYXQgaXMgYG5vLXJlcGVhdGAgd2hpY2ggaXMgZGlmZmVyZW50IHRvIHN0YW5kYXJkIERPTSAod2hpY2ggaXMgYHJlcGVhdGApKlxuICAgICAqXG4gICAgICogSWYgdGhlIHdpZHRoIGFuZCBoZWlnaHQgYXJlIGAwYCBhbmQgcmVwZWF0IGlzIHNldCB0byBgbm8tcmVwZWF0YCB0aGUgd2lkdGggYW5kXG4gICAgICogaGVpZ2h0IHdpbGwgYXV0b21hdGljYWxseSBhc3N1bWUgdGhhdCBvZiB0aGUgaW1hZ2UuIFRoaXMgaXMgYW5cbiAgICAgKiBlYXN5IHdheSB0byBjcmVhdGUgYW4gaW1hZ2Ugd2l0aG91dCBuZWVkaW5nIHNwcml0ZXMuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFdpbGwgZGVmYXVsdCB0byBuby1yZXBlYXQuIEVudGl0eSB3aWR0aCBhbmQgaGVpZ2h0IHdpbGwgYmUgc2V0IHRvIHRoZSBpbWFnZXMgd2lkdGggYW5kIGhlaWdodFxuICAgICAqIH5+flxuICAgICAqIHZhciBlbnQgPSBDcmFmdHkuZShcIjJELCBET00sIEltYWdlXCIpLmltYWdlKFwibXlpbWFnZS5wbmdcIik7XG4gICAgICogfn5+XG4gICAgICogQ3JlYXRlIGEgcmVwZWF0aW5nIGJhY2tncm91bmQuXG4gICAgICogfn5+XG4gICAgICogdmFyIGJnID0gQ3JhZnR5LmUoXCIyRCwgRE9NLCBJbWFnZVwiKVxuICAgICAqICAgICAgICAgICAgICAuYXR0cih7dzogQ3JhZnR5LnZpZXdwb3J0LndpZHRoLCBoOiBDcmFmdHkudmlld3BvcnQuaGVpZ2h0fSlcbiAgICAgKiAgICAgICAgICAgICAgLmltYWdlKFwiYmcucG5nXCIsIFwicmVwZWF0XCIpO1xuICAgICAqIH5+flxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkuc3ByaXRlXG4gICAgICovXG4gICAgaW1hZ2U6IGZ1bmN0aW9uICh1cmwsIHJlcGVhdCkge1xuICAgICAgICB0aGlzLl9faW1hZ2UgPSB1cmw7XG4gICAgICAgIHRoaXMuX3JlcGVhdCA9IHJlcGVhdCB8fCBcIm5vLXJlcGVhdFwiO1xuXG4gICAgICAgIHRoaXMuaW1nID0gQ3JhZnR5LmFzc2V0KHVybCk7XG4gICAgICAgIGlmICghdGhpcy5pbWcpIHtcbiAgICAgICAgICAgIHRoaXMuaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICBDcmFmdHkuYXNzZXQodXJsLCB0aGlzLmltZyk7XG4gICAgICAgICAgICB0aGlzLmltZy5zcmMgPSB1cmw7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuaW1nLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZi5oYXMoXCJDYW52YXNcIikpIHNlbGYuX3BhdHRlcm4gPSBDcmFmdHkuY2FudmFzLmNvbnRleHQuY3JlYXRlUGF0dGVybihzZWxmLmltZywgc2VsZi5fcmVwZWF0KTtcbiAgICAgICAgICAgICAgICBzZWxmLnJlYWR5ID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLl9yZXBlYXQgPT09IFwibm8tcmVwZWF0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi53ID0gc2VsZi5pbWcud2lkdGg7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuaCA9IHNlbGYuaW1nLmhlaWdodDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzZWxmLnRyaWdnZXIoXCJJbnZhbGlkYXRlXCIpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLmhhcyhcIkNhbnZhc1wiKSkgdGhpcy5fcGF0dGVybiA9IENyYWZ0eS5jYW52YXMuY29udGV4dC5jcmVhdGVQYXR0ZXJuKHRoaXMuaW1nLCB0aGlzLl9yZXBlYXQpO1xuICAgICAgICAgICAgaWYgKHRoaXMuX3JlcGVhdCA9PT0gXCJuby1yZXBlYXRcIikge1xuICAgICAgICAgICAgICAgIHRoaXMudyA9IHRoaXMuaW1nLndpZHRoO1xuICAgICAgICAgICAgICAgIHRoaXMuaCA9IHRoaXMuaW1nLmhlaWdodDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiSW52YWxpZGF0ZVwiKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59KTtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkudG9SR0JcbiAgICAgKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAgICAgKiBAc2lnbiBwdWJsaWMgU3RyaW5nIENyYWZ0eS5zY2VuZShTdHJpbmcgaGV4WywgTnVtYmVyIGFscGhhXSlcbiAgICAgKiBAcGFyYW0gaGV4IC0gYSA2IGNoYXJhY3RlciBoZXggbnVtYmVyIHN0cmluZyByZXByZXNlbnRpbmcgUkdCIGNvbG9yXG4gICAgICogQHBhcmFtIGFscGhhIC0gVGhlIGFscGhhIHZhbHVlLlxuICAgICAqXG4gICAgICogR2V0IGEgcmdiIHN0cmluZyBvciByZ2JhIHN0cmluZyAoaWYgYGFscGhhYCBwcmVzZW50cykuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS50b1JHQihcImZmZmZmZlwiKTsgLy8gcmdiKDI1NSwyNTUsMjU1KVxuICAgICAqIENyYWZ0eS50b1JHQihcIiNmZmZmZmZcIik7IC8vIHJnYigyNTUsMjU1LDI1NSlcbiAgICAgKiBDcmFmdHkudG9SR0IoXCJmZmZmZmZcIiwgLjUpOyAvLyByZ2JhKDI1NSwyNTUsMjU1LDAuNSlcbiAgICAgKiB+fn5cbiAgICAgKlxuICAgICAqIEBzZWUgVGV4dC50ZXh0Q29sb3JcbiAgICAgKi9cbiAgICB0b1JHQjogZnVuY3Rpb24gKGhleCwgYWxwaGEpIHtcbiAgICAgICAgaGV4ID0gKGhleC5jaGFyQXQoMCkgPT09ICcjJykgPyBoZXguc3Vic3RyKDEpIDogaGV4O1xuICAgICAgICB2YXIgYyA9IFtdLFxuICAgICAgICAgICAgcmVzdWx0O1xuXG4gICAgICAgIGNbMF0gPSBwYXJzZUludChoZXguc3Vic3RyKDAsIDIpLCAxNik7XG4gICAgICAgIGNbMV0gPSBwYXJzZUludChoZXguc3Vic3RyKDIsIDIpLCAxNik7XG4gICAgICAgIGNbMl0gPSBwYXJzZUludChoZXguc3Vic3RyKDQsIDIpLCAxNik7XG5cbiAgICAgICAgcmVzdWx0ID0gYWxwaGEgPT09IHVuZGVmaW5lZCA/ICdyZ2IoJyArIGMuam9pbignLCcpICsgJyknIDogJ3JnYmEoJyArIGMuam9pbignLCcpICsgJywnICsgYWxwaGEgKyAnKSc7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG59KTtcblxuLyoqQFxuICogI0NyYWZ0eS5EcmF3TWFuYWdlclxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBAc2lnbiBDcmFmdHkuRHJhd01hbmFnZXJcbiAqXG4gKiBBbiBpbnRlcm5hbCBvYmplY3QgbWFuYWdlIG9iamVjdHMgdG8gYmUgZHJhd24gYW5kIGltcGxlbWVudFxuICogdGhlIGJlc3QgbWV0aG9kIG9mIGRyYXdpbmcgaW4gYm90aCBET00gYW5kIGNhbnZhc1xuICovXG5DcmFmdHkuRHJhd01hbmFnZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgIC8qKiBIZWxwZXIgZnVuY3Rpb24gdG8gc29ydCBieSBnbG9iYWxaICovXG4gICAgZnVuY3Rpb24genNvcnQoYSwgYikge1xuICAgICAgICByZXR1cm4gYS5fZ2xvYmFsWiAtIGIuX2dsb2JhbFo7XG4gICAgfVxuXG4gICAgLyoqIGFycmF5IG9mIGRpcnR5IHJlY3RzIG9uIHNjcmVlbiAqL1xuICAgIHZhciBkaXJ0eV9yZWN0cyA9IFtdLFxuICAgICAgICBjaGFuZ2VkX29ianMgPSBbXSxcbiAgICAgICAgLyoqIGFycmF5IG9mIERPTXMgbmVlZGVkIHVwZGF0aW5nICovXG4gICAgICAgIGRvbSA9IFtdLFxuXG4gICAgICAgIGRpcnR5Vmlld3BvcnQgPSBmYWxzZSxcblxuXG4gICAgICAgIC8qKiByZWNNYW5hZ2VyOiBhbiBvYmplY3QgZm9yIG1hbmFnaW5nIGRpcnR5IHJlY3RhbmdsZXMuICovXG4gICAgICAgIHJlY3RNYW5hZ2VyID0ge1xuICAgICAgICAgICAgLyoqIEZpbmRzIHNtYWxsZXN0IHJlY3RhbmdsZXMgdGhhdCBvdmVybGFwcyBhIGFuZCBiLCBtZXJnZXMgdGhlbSBpbnRvIHRhcmdldCAqL1xuICAgICAgICAgICAgbWVyZ2U6IGZ1bmN0aW9uIChhLCBiLCB0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRhcmdldCA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHt9O1xuICAgICAgICAgICAgICAgIC8vIERvaW5nIGl0IGluIHRoaXMgb3JkZXIgbWVhbnMgd2UgY2FuIHVzZSBlaXRoZXIgYSBvciBiIGFzIHRoZSB0YXJnZXQsIHdpdGggbm8gY29uZmxpY3RcbiAgICAgICAgICAgICAgICB0YXJnZXQuX2ggPSBNYXRoLm1heChhLl95ICsgYS5faCwgYi5feSArIGIuX2gpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5fdyA9IE1hdGgubWF4KGEuX3ggKyBhLl93LCBiLl94ICsgYi5fdyk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Ll94ID0gTWF0aC5taW4oYS5feCwgYi5feCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Ll95ID0gTWF0aC5taW4oYS5feSwgYi5feSk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Ll93IC09IHRhcmdldC5feDtcbiAgICAgICAgICAgICAgICB0YXJnZXQuX2ggLT0gdGFyZ2V0Ll95O1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhcmdldDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKiBjbGVhbnMgdXAgY3VycmVudCBkaXJ0eSBzdGF0ZSwgc3RvcmVzIHN0YWxlIHN0YXRlIGZvciBmdXR1cmUgcGFzc2VzICovXG4gICAgICAgICAgICBjbGVhbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHZhciByZWN0LCBvYmosIGk7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMCwgbCA9IGNoYW5nZWRfb2Jqcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gY2hhbmdlZF9vYmpzW2ldO1xuICAgICAgICAgICAgICAgICAgICByZWN0ID0gb2JqLl9tYnIgfHwgb2JqO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9iai5zdGFsZVJlY3QgPT09ICd1bmRlZmluZWQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqLnN0YWxlUmVjdCA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBvYmouc3RhbGVSZWN0Ll94ID0gcmVjdC5feDtcbiAgICAgICAgICAgICAgICAgICAgb2JqLnN0YWxlUmVjdC5feSA9IHJlY3QuX3k7XG4gICAgICAgICAgICAgICAgICAgIG9iai5zdGFsZVJlY3QuX3cgPSByZWN0Ll93O1xuICAgICAgICAgICAgICAgICAgICBvYmouc3RhbGVSZWN0Ll9oID0gcmVjdC5faDtcblxuICAgICAgICAgICAgICAgICAgICBvYmouX2NoYW5nZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2hhbmdlZF9vYmpzLmxlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgZGlydHlfcmVjdHMubGVuZ3RoID0gMDtcblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqIFRha2VzIHRoZSBjdXJyZW50IGFuZCBwcmV2aW91cyBwb3NpdGlvbiBvZiBhbiBvYmplY3QsIGFuZCBwdXNoZXMgdGhlIGRpcnR5IHJlZ2lvbnMgb250byB0aGUgc3RhY2tcbiAgICAgICAgICAgICAqICBJZiB0aGUgZW50aXR5IGhhcyBvbmx5IG1vdmVkL2NoYW5nZWQgYSBsaXR0bGUgYml0LCB0aGUgcmVnaW9ucyBhcmUgc3F1YXNoZWQgdG9nZXRoZXIgKi9cbiAgICAgICAgICAgIGNyZWF0ZURpcnR5OiBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBvYmouX21iciB8fCBvYmo7XG4gICAgICAgICAgICAgICAgaWYgKG9iai5zdGFsZVJlY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9JZiBvdmVybGFwLCBtZXJnZSBzdGFsZSBhbmQgY3VycmVudCBwb3NpdGlvbiB0b2dldGhlciwgdGhlbiByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgLy9PdGhlcndpc2UganVzdCBwdXNoIHN0YWxlIHJlY3RhbmdsZVxuICAgICAgICAgICAgICAgICAgICBpZiAocmVjdE1hbmFnZXIub3ZlcmxhcChvYmouc3RhbGVSZWN0LCByZWN0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVjdE1hbmFnZXIubWVyZ2Uob2JqLnN0YWxlUmVjdCwgcmVjdCwgb2JqLnN0YWxlUmVjdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkaXJ0eV9yZWN0cy5wdXNoKG9iai5zdGFsZVJlY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlydHlfcmVjdHMucHVzaChvYmouc3RhbGVSZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFdlIHVzZSB0aGUgaW50ZXJtZWRpYXRlIFwiY3VycmVudFJlY3RcIiBzbyBpdCBjYW4gYmUgbW9kaWZpZWQgd2l0aG91dCBtZXNzaW5nIHdpdGggb2JqXG4gICAgICAgICAgICAgICAgb2JqLmN1cnJlbnRSZWN0Ll94ID0gcmVjdC5feDtcbiAgICAgICAgICAgICAgICBvYmouY3VycmVudFJlY3QuX3kgPSByZWN0Ll95O1xuICAgICAgICAgICAgICAgIG9iai5jdXJyZW50UmVjdC5fdyA9IHJlY3QuX3c7XG4gICAgICAgICAgICAgICAgb2JqLmN1cnJlbnRSZWN0Ll9oID0gcmVjdC5faDtcbiAgICAgICAgICAgICAgICBkaXJ0eV9yZWN0cy5wdXNoKG9iai5jdXJyZW50UmVjdCk7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKiBDaGVja3Mgd2hldGhlciB0d28gcmVjdGFuZ2xlcyBvdmVybGFwICovXG4gICAgICAgICAgICBvdmVybGFwOiBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiAoYS5feCA8IGIuX3ggKyBiLl93ICYmIGEuX3kgPCBiLl95ICsgYi5faCAmJiBhLl94ICsgYS5fdyA+IGIuX3ggJiYgYS5feSArIGEuX2ggPiBiLl95KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9O1xuXG4gICAgQ3JhZnR5LmJpbmQoXCJJbnZhbGlkYXRlVmlld3BvcnRcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBkaXJ0eVZpZXdwb3J0ID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBDcmFmdHkuYmluZChcIlBvc3RSZW5kZXJcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBkaXJ0eVZpZXdwb3J0ID0gZmFsc2U7XG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuRHJhd01hbmFnZXIudG90YWwyRFxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuRHJhd01hbmFnZXJcbiAgICAgICAgICpcbiAgICAgICAgICogVG90YWwgbnVtYmVyIG9mIHRoZSBlbnRpdGllcyB0aGF0IGhhdmUgdGhlIGAyRGAgY29tcG9uZW50LlxuICAgICAgICAgKi9cbiAgICAgICAgdG90YWwyRDogQ3JhZnR5KFwiMkRcIikubGVuZ3RoLFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5EcmF3TWFuYWdlci5vblNjcmVlblxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuRHJhd01hbmFnZXJcbiAgICAgICAgICogQHNpZ24gcHVibGljIENyYWZ0eS5EcmF3TWFuYWdlci5vblNjcmVlbihPYmplY3QgcmVjdClcbiAgICAgICAgICogQHBhcmFtIHJlY3QgLSBBIHJlY3RhbmdsZSB3aXRoIGZpZWxkIHtfeDogeF92YWwsIF95OiB5X3ZhbCwgX3c6IHdfdmFsLCBfaDogaF92YWx9XG4gICAgICAgICAqXG4gICAgICAgICAqIFRlc3QgaWYgYSByZWN0YW5nbGUgaXMgY29tcGxldGVseSBpbiB2aWV3cG9ydFxuICAgICAgICAgKi9cbiAgICAgICAgb25TY3JlZW46IGZ1bmN0aW9uIChyZWN0KSB7XG4gICAgICAgICAgICByZXR1cm4gQ3JhZnR5LnZpZXdwb3J0Ll94ICsgcmVjdC5feCArIHJlY3QuX3cgPiAwICYmIENyYWZ0eS52aWV3cG9ydC5feSArIHJlY3QuX3kgKyByZWN0Ll9oID4gMCAmJlxuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5feCArIHJlY3QuX3ggPCBDcmFmdHkudmlld3BvcnQud2lkdGggJiYgQ3JhZnR5LnZpZXdwb3J0Ll95ICsgcmVjdC5feSA8IENyYWZ0eS52aWV3cG9ydC5oZWlnaHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LkRyYXdNYW5hZ2VyLm1lcmdlU2V0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5EcmF3TWFuYWdlclxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgT2JqZWN0IENyYWZ0eS5EcmF3TWFuYWdlci5tZXJnZVNldChPYmplY3Qgc2V0KVxuICAgICAgICAgKiBAcGFyYW0gc2V0IC0gYW4gYXJyYXkgb2YgcmVjdGFuZ3VsYXIgcmVnaW9uc1xuICAgICAgICAgKlxuICAgICAgICAgKiBNZXJnZSBhbnkgY29uc2VjdXRpdmUsIG92ZXJsYXBwaW5nIHJlY3RzIGludG8gZWFjaCBvdGhlci5cbiAgICAgICAgICogSXRzIGFuIG9wdGltaXphdGlvbiBmb3IgdGhlIHJlZHJhdyByZWdpb25zLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGUgb3JkZXIgb2Ygc2V0IGlzbid0IHN0cmljdGx5IG1lYW5pbmdmdWwsXG4gICAgICAgICAqIGJ1dCBvdmVybGFwcGluZyBvYmplY3RzIHdpbGwgb2Z0ZW4gY2F1c2UgZWFjaCBvdGhlciB0byBjaGFuZ2UsXG4gICAgICAgICAqIGFuZCBzbyBtaWdodCBiZSBjb25zZWN1dGl2ZS5cbiAgICAgICAgICovXG4gICAgICAgIG1lcmdlU2V0OiBmdW5jdGlvbiAoc2V0KSB7XG4gICAgICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgICAgICB3aGlsZSAoaSA8IHNldC5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgY3VycmVudCBhbmQgbmV4dCBvdmVybGFwLCBtZXJnZSB0aGVtIHRvZ2V0aGVyIGludG8gdGhlIGZpcnN0LCByZW1vdmluZyB0aGUgc2Vjb25kXG4gICAgICAgICAgICAgICAgLy8gVGhlbiBza2lwIHRoZSBpbmRleCBiYWNrd2FyZHMgdG8gY29tcGFyZSB0aGUgcHJldmlvdXMgcGFpci5cbiAgICAgICAgICAgICAgICAvLyBPdGhlcndpc2Ugc2tpcCBmb3J3YXJkXG4gICAgICAgICAgICAgICAgaWYgKHJlY3RNYW5hZ2VyLm92ZXJsYXAoc2V0W2ldLCBzZXRbaSArIDFdKSkge1xuICAgICAgICAgICAgICAgICAgICByZWN0TWFuYWdlci5tZXJnZShzZXRbaV0sIHNldFtpICsgMV0sIHNldFtpXSk7XG4gICAgICAgICAgICAgICAgICAgIHNldC5zcGxpY2UoaSArIDEsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+IDApIGktLTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc2V0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5EcmF3TWFuYWdlci5hZGRDYW52YXNcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LkRyYXdNYW5hZ2VyXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBDcmFmdHkuRHJhd01hbmFnZXIuYWRkQ2FudmFzKGVudClcbiAgICAgICAgICogQHBhcmFtIGVudCAtIFRoZSBlbnRpdHkgdG8gYWRkXG4gICAgICAgICAqXG4gICAgICAgICAqIEFkZCBhbiBlbnRpdHkgdG8gdGhlIGxpc3Qgb2YgQ2FudmFzIG9iamVjdHMgdG8gZHJhd1xuICAgICAgICAgKi9cbiAgICAgICAgYWRkQ2FudmFzOiBmdW5jdGlvbiBhZGRDYW52YXMoZW50KSB7XG4gICAgICAgICAgICBjaGFuZ2VkX29ianMucHVzaChlbnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5EcmF3TWFuYWdlci5hZGREb21cbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LkRyYXdNYW5hZ2VyXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBDcmFmdHkuRHJhd01hbmFnZXIuYWRkRG9tKGVudClcbiAgICAgICAgICogQHBhcmFtIGVudCAtIFRoZSBlbnRpdHkgdG8gYWRkXG4gICAgICAgICAqXG4gICAgICAgICAqIEFkZCBhbiBlbnRpdHkgdG8gdGhlIGxpc3Qgb2YgRE9NIG9iamVjdCB0byBkcmF3XG4gICAgICAgICAqL1xuICAgICAgICBhZGREb206IGZ1bmN0aW9uIGFkZERvbShlbnQpIHtcbiAgICAgICAgICAgIGRvbS5wdXNoKGVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LkRyYXdNYW5hZ2VyLmRlYnVnXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5EcmF3TWFuYWdlclxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgQ3JhZnR5LkRyYXdNYW5hZ2VyLmRlYnVnKClcbiAgICAgICAgICovXG4gICAgICAgIGRlYnVnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjaGFuZ2VkX29ianMsIGRvbSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LkRyYXdNYW5hZ2VyLmRyYXdBbGxcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LkRyYXdNYW5hZ2VyXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBDcmFmdHkuRHJhd01hbmFnZXIuZHJhd0FsbChbT2JqZWN0IHJlY3RdKVxuICAgICAgICAgKiBAcGFyYW0gcmVjdCAtIGEgcmVjdGFuZ3VsYXIgcmVnaW9uIHtfeDogeF92YWwsIF95OiB5X3ZhbCwgX3c6IHdfdmFsLCBfaDogaF92YWx9XG4gICAgICAgICAqXG4gICAgICAgICAqIC0gSWYgcmVjdCBpcyBvbWl0dGVkLCByZWRyYXcgd2l0aGluIHRoZSB2aWV3cG9ydFxuICAgICAgICAgKiAtIElmIHJlY3QgaXMgcHJvdmlkZWQsIHJlZHJhdyB3aXRoaW4gdGhlIHJlY3RcbiAgICAgICAgICovXG4gICAgICAgIGRyYXdBbGw6IGZ1bmN0aW9uIChyZWN0KSB7XG4gICAgICAgICAgICByZWN0ID0gcmVjdCB8fCBDcmFmdHkudmlld3BvcnQucmVjdCgpO1xuICAgICAgICAgICAgdmFyIHEgPSBDcmFmdHkubWFwLnNlYXJjaChyZWN0KSxcbiAgICAgICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgICAgICBsID0gcS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgY3R4ID0gQ3JhZnR5LmNhbnZhcy5jb250ZXh0LFxuICAgICAgICAgICAgICAgIGN1cnJlbnQ7XG5cbiAgICAgICAgICAgIGN0eC5jbGVhclJlY3QocmVjdC5feCwgcmVjdC5feSwgcmVjdC5fdywgcmVjdC5faCk7XG5cbiAgICAgICAgICAgIC8vc29ydCB0aGUgb2JqZWN0cyBieSB0aGUgZ2xvYmFsIFpcbiAgICAgICAgICAgIHEuc29ydCh6c29ydCk7XG4gICAgICAgICAgICBmb3IgKDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBxW2ldO1xuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Ll92aXNpYmxlICYmIGN1cnJlbnQuX19jLkNhbnZhcykge1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50LmRyYXcoKTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudC5fY2hhbmdlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuRHJhd01hbmFnZXIuYm91bmRpbmdSZWN0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5EcmF3TWFuYWdlclxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgQ3JhZnR5LkRyYXdNYW5hZ2VyLmJvdW5kaW5nUmVjdChzZXQpXG4gICAgICAgICAqIEBwYXJhbSBzZXQgLSBVbmRvY3VtZW50ZWRcbiAgICAgICAgICpcbiAgICAgICAgICogLSBDYWxjdWxhdGUgdGhlIGNvbW1vbiBib3VuZGluZyByZWN0IG9mIG11bHRpcGxlIGNhbnZhcyBlbnRpdGllcy5cbiAgICAgICAgICogLSBSZXR1cm5zIGNvb3Jkc1xuICAgICAgICAgKi9cbiAgICAgICAgYm91bmRpbmdSZWN0OiBmdW5jdGlvbiAoc2V0KSB7XG4gICAgICAgICAgICBpZiAoIXNldCB8fCAhc2V0Lmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIG5ld3NldCA9IFtdLFxuICAgICAgICAgICAgICAgIGkgPSAxLFxuICAgICAgICAgICAgICAgIGwgPSBzZXQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGN1cnJlbnQsIG1hc3RlciA9IHNldFswXSxcbiAgICAgICAgICAgICAgICB0bXA7XG4gICAgICAgICAgICBtYXN0ZXIgPSBbbWFzdGVyLl94LCBtYXN0ZXIuX3ksIG1hc3Rlci5feCArIG1hc3Rlci5fdywgbWFzdGVyLl95ICsgbWFzdGVyLl9oXTtcbiAgICAgICAgICAgIHdoaWxlIChpIDwgbCkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBzZXRbaV07XG4gICAgICAgICAgICAgICAgdG1wID0gW2N1cnJlbnQuX3gsIGN1cnJlbnQuX3ksIGN1cnJlbnQuX3ggKyBjdXJyZW50Ll93LCBjdXJyZW50Ll95ICsgY3VycmVudC5faF07XG4gICAgICAgICAgICAgICAgaWYgKHRtcFswXSA8IG1hc3RlclswXSkgbWFzdGVyWzBdID0gdG1wWzBdO1xuICAgICAgICAgICAgICAgIGlmICh0bXBbMV0gPCBtYXN0ZXJbMV0pIG1hc3RlclsxXSA9IHRtcFsxXTtcbiAgICAgICAgICAgICAgICBpZiAodG1wWzJdID4gbWFzdGVyWzJdKSBtYXN0ZXJbMl0gPSB0bXBbMl07XG4gICAgICAgICAgICAgICAgaWYgKHRtcFszXSA+IG1hc3RlclszXSkgbWFzdGVyWzNdID0gdG1wWzNdO1xuICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRtcCA9IG1hc3RlcjtcbiAgICAgICAgICAgIG1hc3RlciA9IHtcbiAgICAgICAgICAgICAgICBfeDogdG1wWzBdLFxuICAgICAgICAgICAgICAgIF95OiB0bXBbMV0sXG4gICAgICAgICAgICAgICAgX3c6IHRtcFsyXSAtIHRtcFswXSxcbiAgICAgICAgICAgICAgICBfaDogdG1wWzNdIC0gdG1wWzFdXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByZXR1cm4gbWFzdGVyO1xuICAgICAgICB9LFxuXG5cblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuRHJhd01hbmFnZXIucmVuZGVyQ2FudmFzXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5EcmF3TWFuYWdlclxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgQ3JhZnR5LkRyYXdNYW5hZ2VyLnJlbmRlckNhbnZhcygpXG4gICAgICAgICAqXG4gICAgICAgICAqIC0gVHJpZ2dlcmVkIGJ5IHRoZSBcIlJlbmRlclNjZW5lXCIgZXZlbnRcbiAgICAgICAgICogLSBJZiB0aGUgbnVtYmVyIG9mIHJlY3RzIGlzIG92ZXIgNjAlIG9mIHRoZSB0b3RhbCBudW1iZXIgb2Ygb2JqZWN0c1xuICAgICAgICAgKlx0ZG8gdGhlIG5haXZlIG1ldGhvZCByZWRyYXdpbmcgYENyYWZ0eS5EcmF3TWFuYWdlci5kcmF3QWxsYFxuICAgICAgICAgKiAtIE90aGVyd2lzZSwgY2xlYXIgdGhlIGRpcnR5IHJlZ2lvbnMsIGFuZCByZWRyYXcgZW50aXRpZXMgb3ZlcmxhcHBpbmcgdGhlIGRpcnR5IHJlZ2lvbnMuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBzZWUgQ2FudmFzLmRyYXdcbiAgICAgICAgICovXG5cbiAgICAgICAgcmVuZGVyQ2FudmFzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbCA9IGNoYW5nZWRfb2Jqcy5sZW5ndGg7XG4gICAgICAgICAgICBpZiAoIWwgJiYgIWRpcnR5Vmlld3BvcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgICAgICByZWN0LCBxLFxuICAgICAgICAgICAgICAgIGosIGxlbiwgb2JqLCBlbnQsIGN0eCA9IENyYWZ0eS5jYW52YXMuY29udGV4dCxcbiAgICAgICAgICAgICAgICBETSA9IENyYWZ0eS5EcmF3TWFuYWdlcjtcblxuXG4gICAgICAgICAgICBpZiAoZGlydHlWaWV3cG9ydCkge1xuICAgICAgICAgICAgICAgIHZhciB2aWV3ID0gQ3JhZnR5LnZpZXdwb3J0O1xuICAgICAgICAgICAgICAgIGN0eC5zZXRUcmFuc2Zvcm0odmlldy5fc2NhbGUsIDAsIDAsIHZpZXcuX3NjYWxlLCB2aWV3Ll94KnZpZXcuX3NjYWxlLCB2aWV3Ll95KnZpZXcuX3NjYWxlKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy9pZiB0aGUgYW1vdW50IG9mIGNoYW5nZWQgb2JqZWN0cyBpcyBvdmVyIDYwJSBvZiB0aGUgdG90YWwgb2JqZWN0c1xuICAgICAgICAgICAgLy9kbyB0aGUgbmFpdmUgbWV0aG9kIHJlZHJhd2luZ1xuICAgICAgICAgICAgLy8gVE9ETzogSSdtIG5vdCBzdXJlIHRoaXMgY29uZGl0aW9uIHJlYWxseSBtYWtlcyB0aGF0IG11Y2ggc2Vuc2UhXG4gICAgICAgICAgICBpZiAobCAvIERNLnRvdGFsMkQgPiAwLjYgfHwgZGlydHlWaWV3cG9ydCkge1xuICAgICAgICAgICAgICAgIERNLmRyYXdBbGwoKTtcbiAgICAgICAgICAgICAgICByZWN0TWFuYWdlci5jbGVhbigpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRpcnR5X3JlY3RzIGZyb20gYWxsIGNoYW5nZWQgb2JqZWN0cywgdGhlbiBtZXJnZSBzb21lIG92ZXJsYXBwaW5nIHJlZ2lvbnMgdG9nZXRoZXJcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICByZWN0TWFuYWdlci5jcmVhdGVEaXJ0eShjaGFuZ2VkX29ianNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGlydHlfcmVjdHMgPSBETS5tZXJnZVNldChkaXJ0eV9yZWN0cyk7XG5cblxuICAgICAgICAgICAgbCA9IGRpcnR5X3JlY3RzLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBkdXBlcyA9IFtdLFxuICAgICAgICAgICAgICAgIG9ianMgPSBbXTtcbiAgICAgICAgICAgIC8vIEZvciBlYWNoIGRpcnR5IHJlY3RhbmdsZSwgZmluZCBlbnRpdGllcyBuZWFyIGl0LCBhbmQgZHJhdyB0aGUgb3ZlcmxhcHBpbmcgb25lc1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGw7ICsraSkgeyAvL2xvb3Agb3ZlciBldmVyeSBkaXJ0eSByZWN0XG4gICAgICAgICAgICAgICAgcmVjdCA9IGRpcnR5X3JlY3RzW2ldO1xuICAgICAgICAgICAgICAgIGR1cGVzLmxlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgb2Jqcy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgICAgIGlmICghcmVjdCkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICAvLyBGaW5kIHRoZSBzbWFsbGVzdCByZWN0YW5nbGUgd2l0aCBpbnRlZ2VyIGNvb3JkaW5hdGVzIHRoYXQgZW5jbG9zZXMgcmVjdFxuICAgICAgICAgICAgICAgIHJlY3QuX3cgPSByZWN0Ll94ICsgcmVjdC5fdztcbiAgICAgICAgICAgICAgICByZWN0Ll9oID0gcmVjdC5feSArIHJlY3QuX2g7XG4gICAgICAgICAgICAgICAgcmVjdC5feCA9IChyZWN0Ll94ID4gMCkgPyAocmVjdC5feHwwKSA6IChyZWN0Ll94fDApIC0gMTtcbiAgICAgICAgICAgICAgICByZWN0Ll95ID0gKHJlY3QuX3kgPiAwKSA/IChyZWN0Ll95fDApIDogKHJlY3QuX3l8MCkgLSAxO1xuICAgICAgICAgICAgICAgIHJlY3QuX3cgLT0gcmVjdC5feDtcbiAgICAgICAgICAgICAgICByZWN0Ll9oIC09IHJlY3QuX3k7XG4gICAgICAgICAgICAgICAgcmVjdC5fdyA9IChyZWN0Ll93ID09PSAocmVjdC5fd3wwKSkgPyByZWN0Ll93IDogKHJlY3QuX3d8MCkgKyAxO1xuICAgICAgICAgICAgICAgIHJlY3QuX2ggPSAocmVjdC5faCA9PT0gKHJlY3QuX2h8MCkpID8gcmVjdC5faCA6IChyZWN0Ll9ofDApICsgMTtcblxuICAgICAgICAgICAgICAgIC8vc2VhcmNoIGZvciBlbnRzIHVuZGVyIGRpcnR5IHJlY3RcbiAgICAgICAgICAgICAgICBxID0gQ3JhZnR5Lm1hcC5zZWFyY2gocmVjdCwgZmFsc2UpO1xuXG4gICAgICAgICAgICAgICAgLy9jbGVhciB0aGUgcmVjdCBmcm9tIHRoZSBtYWluIGNhbnZhc1xuICAgICAgICAgICAgICAgIGN0eC5jbGVhclJlY3QocmVjdC5feCwgcmVjdC5feSwgcmVjdC5fdywgcmVjdC5faCk7XG5cbiAgICAgICAgICAgICAgICAvL1RoZW4gY2xpcCBkcmF3aW5nIHJlZ2lvbiB0byBkaXJ0eSByZWN0YW5nbGVcbiAgICAgICAgICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgICAgICBjdHgucmVjdChyZWN0Ll94LCByZWN0Ll95LCByZWN0Ll93LCByZWN0Ll9oKTtcbiAgICAgICAgICAgICAgICBjdHguY2xpcCgpO1xuXG4gICAgICAgICAgICAgICAgLy8gTG9vcCBvdmVyIGZvdW5kIG9iamVjdHMgcmVtb3ZpbmcgZHVwZXMgYW5kIGFkZGluZyB2aXNpYmxlIGNhbnZhcyBvYmplY3RzIHRvIGFycmF5XG4gICAgICAgICAgICAgICAgZm9yIChqID0gMCwgbGVuID0gcS5sZW5ndGg7IGogPCBsZW47ICsraikge1xuICAgICAgICAgICAgICAgICAgICBvYmogPSBxW2pdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChkdXBlc1tvYmpbMF1dIHx8ICFvYmouX3Zpc2libGUgfHwgIW9iai5fX2MuQ2FudmFzKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIGR1cGVzW29ialswXV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBvYmpzLnB1c2gob2JqKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTb3J0IG9iamVjdHMgYnkgeiBsZXZlbFxuICAgICAgICAgICAgICAgIG9ianMuc29ydCh6c29ydCk7XG5cbiAgICAgICAgICAgICAgICAvLyBUaGVuIGRyYXcgZWFjaCBvYmplY3QgaW4gdGhhdCBvcmRlclxuICAgICAgICAgICAgICAgIGZvciAoaiA9IDAsIGxlbiA9IG9ianMubGVuZ3RoOyBqIDwgbGVuOyArK2opIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gb2Jqc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZWEgPSBvYmouX21iciB8fCBvYmo7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWN0TWFuYWdlci5vdmVybGFwKGFyZWEsIHJlY3QpKVxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqLmRyYXcoKTtcbiAgICAgICAgICAgICAgICAgICAgb2JqLl9jaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQ2xvc2UgcmVjdGFuZ2xlIGNsaXBwaW5nXG4gICAgICAgICAgICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRHJhdyBkaXJ0eSByZWN0YW5nbGVzIGZvciBkZWJ1Z2dpbmcsIGlmIHRoYXQgZmxhZyBpcyBzZXRcbiAgICAgICAgICAgIGlmIChDcmFmdHkuRHJhd01hbmFnZXIuZGVidWdEaXJ0eSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9ICdyZWQnO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDAsIGwgPSBkaXJ0eV9yZWN0cy5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjdCA9IGRpcnR5X3JlY3RzW2ldO1xuICAgICAgICAgICAgICAgICAgICBjdHguc3Ryb2tlUmVjdChyZWN0Ll94LCByZWN0Ll95LCByZWN0Ll93LCByZWN0Ll9oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvL0NsZWFuIHVwIGxpc3RzIGV0Y1xuICAgICAgICAgICAgcmVjdE1hbmFnZXIuY2xlYW4oKTtcblxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5EcmF3TWFuYWdlci5yZW5kZXJET01cbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LkRyYXdNYW5hZ2VyXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyBDcmFmdHkuRHJhd01hbmFnZXIucmVuZGVyRE9NKClcbiAgICAgICAgICpcbiAgICAgICAgICogV2hlbiBcIlJlbmRlclNjZW5lXCIgaXMgdHJpZ2dlcmVkLCBkcmF3cyBhbGwgRE9NIGVudGl0aWVzIHRoYXQgaGF2ZSBiZWVuIGZsYWdnZWRcbiAgICAgICAgICpcbiAgICAgICAgICogQHNlZSBET00uZHJhd1xuICAgICAgICAgKi9cbiAgICAgICAgcmVuZGVyRE9NOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBBZGp1c3QgdGhlIHZpZXdwb3J0XG4gICAgICAgICAgICBpZiAoZGlydHlWaWV3cG9ydCkge1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IENyYWZ0eS5zdGFnZS5pbm5lci5zdHlsZSxcbiAgICAgICAgICAgICAgICAgICAgdmlldyA9IENyYWZ0eS52aWV3cG9ydDtcblxuICAgICAgICAgICAgICAgIHN0eWxlLnRyYW5zZm9ybSA9IHN0eWxlW0NyYWZ0eS5zdXBwb3J0LnByZWZpeCArIFwiVHJhbnNmb3JtXCJdID0gXCJzY2FsZShcIiArIHZpZXcuX3NjYWxlICsgXCIsIFwiICsgdmlldy5fc2NhbGUgKyBcIilcIjtcbiAgICAgICAgICAgICAgICBzdHlsZS5sZWZ0ID0gdmlldy54ICogdmlldy5fc2NhbGUgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgc3R5bGUudG9wID0gdmlldy55ICogdmlldy5fc2NhbGUgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgc3R5bGUuekluZGV4ID0gMTA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vaWYgbm8gb2JqZWN0cyBoYXZlIGJlZW4gY2hhbmdlZCwgc3RvcFxuICAgICAgICAgICAgaWYgKCFkb20ubGVuZ3RoKSByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciBpID0gMCxcbiAgICAgICAgICAgICAgICBrID0gZG9tLmxlbmd0aDtcbiAgICAgICAgICAgIC8vbG9vcCBvdmVyIGFsbCBET00gZWxlbWVudHMgbmVlZGluZyB1cGRhdGluZ1xuICAgICAgICAgICAgZm9yICg7IGkgPCBrOyArK2kpIHtcbiAgICAgICAgICAgICAgICBkb21baV0uZHJhdygpLl9jaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vcmVzZXQgRE9NIGFycmF5XG4gICAgICAgICAgICBkb20ubGVuZ3RoID0gMDtcblxuICAgICAgICB9XG5cblxuICAgIH07XG59KSgpO1xuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5waXhlbGFydFxuICAgICAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5waXhlbGFydChCb29sZWFuIGVuYWJsZWQpXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSBpbWFnZSBzbW9vdGhpbmcgZm9yIGRyYXdpbmcgaW1hZ2VzIChmb3IgYm90aCBET00gYW5kIENhbnZhcykuXG4gICAgICogU2V0dGluZyB0aGlzIHRvIHRydWUgZGlzYWJsZXMgc21vb3RoaW5nIGZvciBpbWFnZXMsIHdoaWNoIGlzIHRoZSBwcmVmZXJyZWRcbiAgICAgKiB3YXkgZm9yIGRyYXdpbmcgcGl4ZWwgYXJ0LiBEZWZhdWx0cyB0byBmYWxzZS5cbiAgICAgKlxuICAgICAqIFRoaXMgZmVhdHVyZSBpcyBleHBlcmltZW50YWwgYW5kIHlvdSBzaG91bGQgYmUgY2FyZWZ1bCB3aXRoIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJpbGl0eS4gXG4gICAgICogVGhlIGJlc3Qgd2F5IHRvIGRpc2FibGUgaW1hZ2Ugc21vb3RoaW5nIGlzIHRvIHVzZSB0aGUgQ2FudmFzIHJlbmRlciBtZXRob2QgYW5kIHRoZSBTcHJpdGUgY29tcG9uZW50IGZvciBkcmF3aW5nIHlvdXIgZW50aXRpZXMuXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCB3aWxsIGhhdmUgbm8gZWZmZWN0IGZvciBDYW52YXMgaW1hZ2Ugc21vb3RoaW5nIGlmIHRoZSBjYW52YXMgaXMgbm90IGluaXRpYWxpemVkIHlldC5cbiAgICAgKlxuICAgICAqIE5vdGUgdGhhdCBGaXJlZm94XzI2IGN1cnJlbnRseSBoYXMgYSBbYnVnXShodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTY2MzApIFxuICAgICAqIHdoaWNoIHByZXZlbnRzIGRpc2FibGluZyBpbWFnZSBzbW9vdGhpbmcgZm9yIENhbnZhcyBlbnRpdGllcyB0aGF0IHVzZSB0aGUgSW1hZ2UgY29tcG9uZW50LiBVc2UgdGhlIFNwcml0ZVxuICAgICAqIGNvbXBvbmVudCBpbnN0ZWFkLlxuICAgICAqIE5vdGUgdGhhdCBXZWJraXQgKENocm9tZSAmIFNhZmFyaSkgY3VycmVudGx5IGhhcyBhIGJ1ZyBbbGluazFdKGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTEzNDA0MCkgXG4gICAgICogW2xpbmsyXShodHRwOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0xMDY2NjIpIHRoYXQgcHJldmVudHMgZGlzYWJsaW5nIGltYWdlIHNtb290aGluZ1xuICAgICAqIGZvciBET00gZW50aXRpZXMuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFRoaXMgaXMgdGhlIHByZWZlcnJlZCB3YXkgdG8gZHJhdyBwaXhlbCBhcnQgd2l0aCB0aGUgYmVzdCBjcm9zcy1icm93c2VyIGNvbXBhdGliaWxpdHkuXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmNhbnZhcy5pbml0KCk7XG4gICAgICogQ3JhZnR5LnBpeGVsYXJ0KHRydWUpO1xuICAgICAqIFxuICAgICAqIENyYWZ0eS5zcHJpdGUoaW1nV2lkdGgsIGltZ0hlaWdodCwgXCJzcHJpdGVNYXAucG5nXCIsIHtzcHJpdGUxOlswLDBdfSk7XG4gICAgICogQ3JhZnR5LmUoXCIyRCwgQ2FudmFzLCBzcHJpdGUxXCIpO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIHBpeGVsYXJ0OiBmdW5jdGlvbihlbmFibGVkKSB7XG4gICAgICAgIHZhciBjb250ZXh0ID0gQ3JhZnR5LmNhbnZhcy5jb250ZXh0O1xuICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgY29udGV4dC5pbWFnZVNtb290aGluZ0VuYWJsZWQgPSAhZW5hYmxlZDtcbiAgICAgICAgICAgIGNvbnRleHQubW96SW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gIWVuYWJsZWQ7XG4gICAgICAgICAgICBjb250ZXh0LndlYmtpdEltYWdlU21vb3RoaW5nRW5hYmxlZCA9ICFlbmFibGVkO1xuICAgICAgICAgICAgY29udGV4dC5vSW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gIWVuYWJsZWQ7XG4gICAgICAgICAgICBjb250ZXh0Lm1zSW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gIWVuYWJsZWQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3R5bGUgPSBDcmFmdHkuc3RhZ2UuaW5uZXIuc3R5bGU7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICBzdHlsZVtDcmFmdHkuRE9NLmNhbWVsaXplKFwiaW1hZ2UtcmVuZGVyaW5nXCIpXSA9IFwib3B0aW1pemVTcGVlZFwiOyAgIC8qIGxlZ2FjeSAqL1xuICAgICAgICAgICAgc3R5bGVbQ3JhZnR5LkRPTS5jYW1lbGl6ZShcImltYWdlLXJlbmRlcmluZ1wiKV0gPSBcIi1tb3otY3Jpc3AtZWRnZXNcIjsgICAgLyogRmlyZWZveCAqL1xuICAgICAgICAgICAgc3R5bGVbQ3JhZnR5LkRPTS5jYW1lbGl6ZShcImltYWdlLXJlbmRlcmluZ1wiKV0gPSBcIi1vLWNyaXNwLWVkZ2VzXCI7ICAvKiBPcGVyYSAqL1xuICAgICAgICAgICAgc3R5bGVbQ3JhZnR5LkRPTS5jYW1lbGl6ZShcImltYWdlLXJlbmRlcmluZ1wiKV0gPSBcIi13ZWJraXQtb3B0aW1pemUtY29udHJhc3RcIjsgICAvKiBXZWJraXQgKENocm9tZSAmIFNhZmFyaSkgKi9cbiAgICAgICAgICAgIHN0eWxlW0NyYWZ0eS5ET00uY2FtZWxpemUoXCItbXMtaW50ZXJwb2xhdGlvbi1tb2RlXCIpXSA9IFwibmVhcmVzdC1uZWlnaGJvclwiOyAgLyogSUUgKi9cbiAgICAgICAgICAgIHN0eWxlW0NyYWZ0eS5ET00uY2FtZWxpemUoXCJpbWFnZS1yZW5kZXJpbmdcIildID0gXCJvcHRpbWl6ZS1jb250cmFzdFwiOyAgIC8qIENTUzMgcHJvcG9zZWQgKi9cbiAgICAgICAgICAgIHN0eWxlW0NyYWZ0eS5ET00uY2FtZWxpemUoXCJpbWFnZS1yZW5kZXJpbmdcIildID0gXCJwaXhlbGF0ZWRcIjsgICAvKiBDU1M0IHByb3Bvc2VkICovXG4gICAgICAgICAgICBzdHlsZVtDcmFmdHkuRE9NLmNhbWVsaXplKFwiaW1hZ2UtcmVuZGVyaW5nXCIpXSA9IFwiY3Jpc3AtZWRnZXNcIjsgLyogQ1NTNCBwcm9wb3NlZCAqL1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3R5bGVbQ3JhZnR5LkRPTS5jYW1lbGl6ZShcImltYWdlLXJlbmRlcmluZ1wiKV0gPSBcIm9wdGltaXplUXVhbGl0eVwiOyAgIC8qIGxlZ2FjeSAqL1xuICAgICAgICAgICAgc3R5bGVbQ3JhZnR5LkRPTS5jYW1lbGl6ZShcIi1tcy1pbnRlcnBvbGF0aW9uLW1vZGVcIildID0gXCJiaWN1YmljXCI7ICAgLyogSUUgKi9cbiAgICAgICAgICAgIHN0eWxlW0NyYWZ0eS5ET00uY2FtZWxpemUoXCJpbWFnZS1yZW5kZXJpbmdcIildID0gXCJhdXRvXCI7ICAgLyogQ1NTMyAqL1xuICAgICAgICB9XG4gICAgfVxufSk7XG4iLCJ2YXIgQ3JhZnR5ID0gcmVxdWlyZSgnLi9jb3JlLmpzJyksXG4gICAgZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQ7XG5cbi8qKkBcbiAqICNDcmFmdHkuc3VwcG9ydFxuICogQGNhdGVnb3J5IE1pc2MsIENvcmVcbiAqIERldGVybWluZXMgZmVhdHVyZSBzdXBwb3J0IGZvciB3aGF0IENyYWZ0eSBjYW4gZG8uXG4gKi9cbihmdW5jdGlvbiB0ZXN0U3VwcG9ydCgpIHtcbiAgICB2YXIgc3VwcG9ydCA9IENyYWZ0eS5zdXBwb3J0ID0ge30sXG4gICAgICAgIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLFxuICAgICAgICBtYXRjaCA9IC8od2Via2l0KVsgXFwvXShbXFx3Ll0rKS8uZXhlYyh1YSkgfHxcbiAgICAgICAgICAgIC8obylwZXJhKD86Lip2ZXJzaW9uKT9bIFxcL10oW1xcdy5dKykvLmV4ZWModWEpIHx8XG4gICAgICAgICAgICAvKG1zKWllIChbXFx3Ll0rKS8uZXhlYyh1YSkgfHxcbiAgICAgICAgICAgIC8obW96KWlsbGEoPzouKj8gcnY6KFtcXHcuXSspKT8vLmV4ZWModWEpIHx8IFtdLFxuICAgICAgICBtb2JpbGUgPSAvaVBhZHxpUG9kfGlQaG9uZXxBbmRyb2lkfHdlYk9TfElFTW9iaWxlL2kuZXhlYyh1YSk7XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tb2JpbGVcbiAgICAgKiBAY29tcCBDcmFmdHkuZGV2aWNlXG4gICAgICpcbiAgICAgKiBEZXRlcm1pbmVzIGlmIENyYWZ0eSBpcyBydW5uaW5nIG9uIG1vYmlsZSBkZXZpY2UuXG4gICAgICpcbiAgICAgKiBJZiBDcmFmdHkubW9iaWxlIGlzIGVxdWFsIHRydWUgQ3JhZnR5IGRvZXMgc29tZSB0aGluZ3MgdW5kZXIgaG9vZDpcbiAgICAgKiB+fn5cbiAgICAgKiAtIHNldCB2aWV3cG9ydCBvbiBtYXggZGV2aWNlIHdpZHRoIGFuZCBoZWlnaHRcbiAgICAgKiAtIHNldCBDcmFmdHkuc3RhZ2UuZnVsbHNjcmVlbiBvbiB0cnVlXG4gICAgICogLSBoaWRlIHdpbmRvdyBzY3JvbGxiYXJzXG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS52aWV3cG9ydFxuICAgICAqL1xuICAgIGlmIChtb2JpbGUpIENyYWZ0eS5tb2JpbGUgPSBtb2JpbGVbMF07XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LnNldHRlclxuICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICogSXMgYF9fZGVmaW5lU2V0dGVyX19gIHN1cHBvcnRlZD9cbiAgICAgKi9cbiAgICBzdXBwb3J0LnNldHRlciA9ICgnX19kZWZpbmVTZXR0ZXJfXycgaW4gdGhpcyAmJiAnX19kZWZpbmVHZXR0ZXJfXycgaW4gdGhpcyk7XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LmRlZmluZVByb3BlcnR5XG4gICAgICogQGNvbXAgQ3JhZnR5LnN1cHBvcnRcbiAgICAgKiBJcyBgT2JqZWN0LmRlZmluZVByb3BlcnR5YCBzdXBwb3J0ZWQ/XG4gICAgICovXG4gICAgc3VwcG9ydC5kZWZpbmVQcm9wZXJ0eSA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghKCdkZWZpbmVQcm9wZXJ0eScgaW4gT2JqZWN0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCAneCcsIHt9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pKCk7XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LmF1ZGlvXG4gICAgICogQGNvbXAgQ3JhZnR5LnN1cHBvcnRcbiAgICAgKiBJcyBIVE1MNSBgQXVkaW9gIHN1cHBvcnRlZD9cbiAgICAgKi9cbiAgICBzdXBwb3J0LmF1ZGlvID0gKCdBdWRpbycgaW4gd2luZG93KTtcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LnN1cHBvcnQucHJlZml4XG4gICAgICogQGNvbXAgQ3JhZnR5LnN1cHBvcnRcbiAgICAgKiBSZXR1cm5zIHRoZSBicm93c2VyIHNwZWNpZmljIHByZWZpeCAoYE1vemAsIGBPYCwgYG1zYCwgYHdlYmtpdGApLlxuICAgICAqL1xuICAgIHN1cHBvcnQucHJlZml4ID0gKG1hdGNoWzFdIHx8IG1hdGNoWzBdKTtcblxuICAgIC8vYnJvd3NlciBzcGVjaWZpYyBxdWlya3NcbiAgICBpZiAoc3VwcG9ydC5wcmVmaXggPT09IFwibW96XCIpIHN1cHBvcnQucHJlZml4ID0gXCJNb3pcIjtcbiAgICBpZiAoc3VwcG9ydC5wcmVmaXggPT09IFwib1wiKSBzdXBwb3J0LnByZWZpeCA9IFwiT1wiO1xuXG4gICAgaWYgKG1hdGNoWzJdKSB7XG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5zdXBwb3J0LnZlcnNpb25OYW1lXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICAgICAqIFZlcnNpb24gb2YgdGhlIGJyb3dzZXJcbiAgICAgICAgICovXG4gICAgICAgIHN1cHBvcnQudmVyc2lvbk5hbWUgPSBtYXRjaFsyXTtcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuc3VwcG9ydC52ZXJzaW9uXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICAgICAqIFZlcnNpb24gbnVtYmVyIG9mIHRoZSBicm93c2VyIGFzIGFuIEludGVnZXIgKGZpcnN0IG51bWJlcilcbiAgICAgICAgICovXG4gICAgICAgIHN1cHBvcnQudmVyc2lvbiA9ICsobWF0Y2hbMl0uc3BsaXQoXCIuXCIpKVswXTtcbiAgICB9XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LmNhbnZhc1xuICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICogSXMgdGhlIGBjYW52YXNgIGVsZW1lbnQgc3VwcG9ydGVkP1xuICAgICAqL1xuICAgIHN1cHBvcnQuY2FudmFzID0gKCdnZXRDb250ZXh0JyBpbiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpKTtcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LnN1cHBvcnQud2ViZ2xcbiAgICAgKiBAY29tcCBDcmFmdHkuc3VwcG9ydFxuICAgICAqIElzIFdlYkdMIHN1cHBvcnRlZCBvbiB0aGUgY2FudmFzIGVsZW1lbnQ/XG4gICAgICovXG4gICAgaWYgKHN1cHBvcnQuY2FudmFzKSB7XG4gICAgICAgIHZhciBnbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGdsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKS5nZXRDb250ZXh0KFwiZXhwZXJpbWVudGFsLXdlYmdsXCIpO1xuICAgICAgICAgICAgZ2wudmlld3BvcnRXaWR0aCA9IHN1cHBvcnQuY2FudmFzLndpZHRoO1xuICAgICAgICAgICAgZ2wudmlld3BvcnRIZWlnaHQgPSBzdXBwb3J0LmNhbnZhcy5oZWlnaHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgIHN1cHBvcnQud2ViZ2wgPSAhISBnbDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdXBwb3J0LndlYmdsID0gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuc3VwcG9ydC5jc3MzZHRyYW5zZm9ybVxuICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICogSXMgY3NzM0R0cmFuc2Zvcm0gc3VwcG9ydGVkIGJ5IGJyb3dzZXIuXG4gICAgICovXG4gICAgc3VwcG9ydC5jc3MzZHRyYW5zZm9ybSA9ICh0eXBlb2YgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKS5zdHlsZS5QZXJzcGVjdGl2ZSAhPT0gXCJ1bmRlZmluZWRcIikgfHwgKHR5cGVvZiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLnN0eWxlW3N1cHBvcnQucHJlZml4ICsgXCJQZXJzcGVjdGl2ZVwiXSAhPT0gXCJ1bmRlZmluZWRcIik7XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LmRldmljZW9yaWVudGF0aW9uXG4gICAgICogQGNvbXAgQ3JhZnR5LnN1cHBvcnRcbiAgICAgKiBJcyBkZXZpY2VvcmllbnRhdGlvbiBldmVudCBzdXBwb3J0ZWQgYnkgYnJvd3Nlci5cbiAgICAgKi9cbiAgICBzdXBwb3J0LmRldmljZW9yaWVudGF0aW9uID0gKHR5cGVvZiB3aW5kb3cuRGV2aWNlT3JpZW50YXRpb25FdmVudCAhPT0gXCJ1bmRlZmluZWRcIikgfHwgKHR5cGVvZiB3aW5kb3cuT3JpZW50YXRpb25FdmVudCAhPT0gXCJ1bmRlZmluZWRcIik7XG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zdXBwb3J0LmRldmljZW1vdGlvblxuICAgICAqIEBjb21wIENyYWZ0eS5zdXBwb3J0XG4gICAgICogSXMgZGV2aWNlbW90aW9uIGV2ZW50IHN1cHBvcnRlZCBieSBicm93c2VyLlxuICAgICAqL1xuICAgIHN1cHBvcnQuZGV2aWNlbW90aW9uID0gKHR5cGVvZiB3aW5kb3cuRGV2aWNlTW90aW9uRXZlbnQgIT09IFwidW5kZWZpbmVkXCIpO1xuXG59KSgpO1xuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICBfZXZlbnRzOiB7fSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmFkZEV2ZW50XG4gICAgICogQGNhdGVnb3J5IEV2ZW50cywgTWlzY1xuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hZGRFdmVudChPYmplY3QgY3R4LCBIVE1MRWxlbWVudCBvYmosIFN0cmluZyBldmVudCwgRnVuY3Rpb24gY2FsbGJhY2spXG4gICAgICogQHBhcmFtIGN0eCAtIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIG9yIHRoZSB2YWx1ZSBvZiBgdGhpc2BcbiAgICAgKiBAcGFyYW0gb2JqIC0gRWxlbWVudCB0byBhZGQgdGhlIERPTSBldmVudCB0b1xuICAgICAqIEBwYXJhbSBldmVudCAtIEV2ZW50IG5hbWUgdG8gYmluZCB0b1xuICAgICAqIEBwYXJhbSBjYWxsYmFjayAtIE1ldGhvZCB0byBleGVjdXRlIHdoZW4gdHJpZ2dlcmVkXG4gICAgICpcbiAgICAgKiBBZGRzIERPTSBsZXZlbCAzIGV2ZW50cyB0byBlbGVtZW50cy4gVGhlIGFyZ3VtZW50cyBpdCBhY2NlcHRzIGFyZSB0aGUgY2FsbFxuICAgICAqIGNvbnRleHQgKHRoZSB2YWx1ZSBvZiBgdGhpc2ApLCB0aGUgRE9NIGVsZW1lbnQgdG8gYXR0YWNoIHRoZSBldmVudCB0byxcbiAgICAgKiB0aGUgZXZlbnQgbmFtZSAod2l0aG91dCBgb25gIChgY2xpY2tgIHJhdGhlciB0aGFuIGBvbmNsaWNrYCkpIGFuZFxuICAgICAqIGZpbmFsbHkgdGhlIGNhbGxiYWNrIG1ldGhvZC5cbiAgICAgKlxuICAgICAqIElmIG5vIGVsZW1lbnQgaXMgcGFzc2VkLCB0aGUgZGVmYXVsdCBlbGVtZW50IHdpbGwgYmUgYHdpbmRvdy5kb2N1bWVudGAuXG4gICAgICpcbiAgICAgKiBDYWxsYmFja3MgYXJlIHBhc3NlZCB3aXRoIGV2ZW50IGRhdGEuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIFdpbGwgYWRkIGEgc3RhZ2Utd2lkZSBNb3VzZURvd24gZXZlbnQgbGlzdGVuZXIgdG8gdGhlIHBsYXllci4gV2lsbCBsb2cgd2hpY2ggYnV0dG9uIHdhcyBwcmVzc2VkXG4gICAgICogJiB0aGUgKHgseSkgY29vcmRpbmF0ZXMgaW4gdmlld3BvcnQvd29ybGQvZ2FtZSBzcGFjZS5cbiAgICAgKiB+fn5cbiAgICAgKiB2YXIgcGxheWVyID0gQ3JhZnR5LmUoXCIyRFwiKTtcbiAgICAgKiAgICAgcGxheWVyLm9uTW91c2VEb3duID0gZnVuY3Rpb24oZSkge1xuICAgICAqICAgICAgICAgY29uc29sZS5sb2coZS5tb3VzZUJ1dHRvbiwgZS5yZWFsWCwgZS5yZWFsWSk7XG4gICAgICogICAgIH07XG4gICAgICogQ3JhZnR5LmFkZEV2ZW50KHBsYXllciwgQ3JhZnR5LnN0YWdlLmVsZW0sIFwibW91c2Vkb3duXCIsIHBsYXllci5vbk1vdXNlRG93bik7XG4gICAgICogfn5+XG4gICAgICogQHNlZSBDcmFmdHkucmVtb3ZlRXZlbnRcbiAgICAgKi9cbiAgICBhZGRFdmVudDogZnVuY3Rpb24gKGN0eCwgb2JqLCB0eXBlLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSB0eXBlO1xuICAgICAgICAgICAgdHlwZSA9IG9iajtcbiAgICAgICAgICAgIG9iaiA9IHdpbmRvdy5kb2N1bWVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc2F2ZSBhbm9ueW1vdXMgZnVuY3Rpb24gdG8gYmUgYWJsZSB0byByZW1vdmVcbiAgICAgICAgdmFyIGFmbiA9IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBlID0gZSB8fCB3aW5kb3cuZXZlbnQ7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKGN0eCwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgICAgICBpZCA9IGN0eFswXSB8fCBcIlwiO1xuXG4gICAgICAgIGlmICghdGhpcy5fZXZlbnRzW2lkICsgb2JqICsgdHlwZSArIGNhbGxiYWNrXSkgdGhpcy5fZXZlbnRzW2lkICsgb2JqICsgdHlwZSArIGNhbGxiYWNrXSA9IGFmbjtcbiAgICAgICAgZWxzZSByZXR1cm47XG5cbiAgICAgICAgaWYgKG9iai5hdHRhY2hFdmVudCkgeyAvL0lFXG4gICAgICAgICAgICBvYmouYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGFmbik7XG4gICAgICAgIH0gZWxzZSB7IC8vRXZlcnlvbmUgZWxzZVxuICAgICAgICAgICAgb2JqLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgYWZuLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkucmVtb3ZlRXZlbnRcbiAgICAgKiBAY2F0ZWdvcnkgRXZlbnRzLCBNaXNjXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LnJlbW92ZUV2ZW50KE9iamVjdCBjdHgsIEhUTUxFbGVtZW50IG9iaiwgU3RyaW5nIGV2ZW50LCBGdW5jdGlvbiBjYWxsYmFjaylcbiAgICAgKiBAcGFyYW0gY3R4IC0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgb3IgdGhlIHZhbHVlIG9mIGB0aGlzYFxuICAgICAqIEBwYXJhbSBvYmogLSBFbGVtZW50IHRoZSBldmVudCBpcyBvblxuICAgICAqIEBwYXJhbSBldmVudCAtIE5hbWUgb2YgdGhlIGV2ZW50XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIC0gTWV0aG9kIGV4ZWN1dGVkIHdoZW4gdHJpZ2dlcmVkXG4gICAgICpcbiAgICAgKiBSZW1vdmVzIGV2ZW50cyBhdHRhY2hlZCBieSBgQ3JhZnR5LmFkZEV2ZW50KClgLiBBbGwgcGFyYW1ldGVycyBtdXN0XG4gICAgICogYmUgdGhlIHNhbWUgdGhhdCB3ZXJlIHVzZWQgdG8gYXR0YWNoIHRoZSBldmVudCBpbmNsdWRpbmcgYSByZWZlcmVuY2VcbiAgICAgKiB0byB0aGUgY2FsbGJhY2sgbWV0aG9kLlxuICAgICAqXG4gICAgICogQHNlZSBDcmFmdHkuYWRkRXZlbnRcbiAgICAgKi9cbiAgICByZW1vdmVFdmVudDogZnVuY3Rpb24gKGN0eCwgb2JqLCB0eXBlLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSB0eXBlO1xuICAgICAgICAgICAgdHlwZSA9IG9iajtcbiAgICAgICAgICAgIG9iaiA9IHdpbmRvdy5kb2N1bWVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vcmV0cmlldmUgYW5vbnltb3VzIGZ1bmN0aW9uXG4gICAgICAgIHZhciBpZCA9IGN0eFswXSB8fCBcIlwiLFxuICAgICAgICAgICAgYWZuID0gdGhpcy5fZXZlbnRzW2lkICsgb2JqICsgdHlwZSArIGNhbGxiYWNrXTtcblxuICAgICAgICBpZiAoYWZuKSB7XG4gICAgICAgICAgICBpZiAob2JqLmRldGFjaEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgb2JqLmRldGFjaEV2ZW50KCdvbicgKyB0eXBlLCBhZm4pO1xuICAgICAgICAgICAgfSBlbHNlIG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGFmbiwgZmFsc2UpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1tpZCArIG9iaiArIHR5cGUgKyBjYWxsYmFja107XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkuYmFja2dyb3VuZFxuICAgICAqIEBjYXRlZ29yeSBHcmFwaGljcywgU3RhZ2VcbiAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkuYmFja2dyb3VuZChTdHJpbmcgdmFsdWUpXG4gICAgICogQHBhcmFtIHN0eWxlIC0gTW9kaWZ5IHRoZSBiYWNrZ3JvdW5kIHdpdGggYSBjb2xvciBvciBpbWFnZVxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2QgaXMgZXNzZW50aWFsbHkgYSBzaG9ydGN1dCBmb3IgYWRkaW5nIGEgYmFja2dyb3VuZFxuICAgICAqIHN0eWxlIHRvIHRoZSBzdGFnZSBlbGVtZW50LlxuICAgICAqL1xuICAgIGJhY2tncm91bmQ6IGZ1bmN0aW9uIChzdHlsZSkge1xuICAgICAgICBDcmFmdHkuc3RhZ2UuZWxlbS5zdHlsZS5iYWNrZ3JvdW5kID0gc3R5bGU7XG4gICAgfVxufSk7IiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG4vKipAXG4gKiAjSFRNTFxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBDb21wb25lbnQgYWxsb3cgZm9yIGluc2VydGlvbiBvZiBhcmJpdHJhcnkgSFRNTCBpbnRvIGFuIGVudGl0eVxuICovXG5DcmFmdHkuYyhcIkhUTUxcIiwge1xuICAgIGlubmVyOiAnJyxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZXF1aXJlcygnMkQsIERPTScpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogIy5yZXBsYWNlXG4gICAgICogQGNvbXAgSFRNTFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5yZXBsYWNlKFN0cmluZyBodG1sKVxuICAgICAqIEBwYXJhbSBodG1sIC0gYXJiaXRyYXJ5IGh0bWxcbiAgICAgKlxuICAgICAqIFRoaXMgbWV0aG9kIHdpbGwgcmVwbGFjZSB0aGUgY29udGVudCBvZiB0aGlzIGVudGl0eSB3aXRoIHRoZSBzdXBwbGllZCBodG1sXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIENyZWF0ZSBhIGxpbmtcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIkhUTUxcIilcbiAgICAgKiAgICAuYXR0cih7eDoyMCwgeToyMCwgdzoxMDAsIGg6MTAwfSlcbiAgICAgKiAgICAucmVwbGFjZShcIjxhIGhyZWY9J2luZGV4Lmh0bWwnPkluZGV4PC9hPlwiKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICByZXBsYWNlOiBmdW5jdGlvbiAobmV3X2h0bWwpIHtcbiAgICAgICAgdGhpcy5pbm5lciA9IG5ld19odG1sO1xuICAgICAgICB0aGlzLl9lbGVtZW50LmlubmVySFRNTCA9IG5ld19odG1sO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuYXBwZW5kXG4gICAgICogQGNvbXAgSFRNTFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC5hcHBlbmQoU3RyaW5nIGh0bWwpXG4gICAgICogQHBhcmFtIGh0bWwgLSBhcmJpdHJhcnkgaHRtbFxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2Qgd2lsbCBhZGQgdGhlIHN1cHBsaWVkIGh0bWwgaW4gdGhlIGVuZCBvZiB0aGUgZW50aXR5XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIENyZWF0ZSBhIGxpbmtcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIkhUTUxcIilcbiAgICAgKiAgICAuYXR0cih7eDoyMCwgeToyMCwgdzoxMDAsIGg6MTAwfSlcbiAgICAgKiAgICAuYXBwZW5kKFwiPGEgaHJlZj0naW5kZXguaHRtbCc+SW5kZXg8L2E+XCIpO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIGFwcGVuZDogZnVuY3Rpb24gKG5ld19odG1sKSB7XG4gICAgICAgIHRoaXMuaW5uZXIgKz0gbmV3X2h0bWw7XG4gICAgICAgIHRoaXMuX2VsZW1lbnQuaW5uZXJIVE1MICs9IG5ld19odG1sO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMucHJlcGVuZFxuICAgICAqIEBjb21wIEhUTUxcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAucHJlcGVuZChTdHJpbmcgaHRtbClcbiAgICAgKiBAcGFyYW0gaHRtbCAtIGFyYml0cmFyeSBodG1sXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCB3aWxsIGFkZCB0aGUgc3VwcGxpZWQgaHRtbCBpbiB0aGUgYmVnaW5uaW5nIG9mIHRoZSBlbnRpdHlcbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogQ3JlYXRlIGEgbGlua1xuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiSFRNTFwiKVxuICAgICAqICAgIC5hdHRyKHt4OjIwLCB5OjIwLCB3OjEwMCwgaDoxMDB9KVxuICAgICAqICAgIC5wcmVwZW5kKFwiPGEgaHJlZj0naW5kZXguaHRtbCc+SW5kZXg8L2E+XCIpO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIHByZXBlbmQ6IGZ1bmN0aW9uIChuZXdfaHRtbCkge1xuICAgICAgICB0aGlzLmlubmVyID0gbmV3X2h0bWwgKyB0aGlzLmlubmVyO1xuICAgICAgICB0aGlzLl9lbGVtZW50LmlubmVySFRNTCA9IG5ld19odG1sICsgdGhpcy5pbm5lcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufSk7IiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxyXG4gICAgZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQ7XHJcblxyXG4vKipAXHJcbiAqICNDcmFmdHkuaW1wb3J0XHJcbiAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5pbXBvcnQoU3RyaW5nIHVybFssIFN0cmluZyBzY2VuZV0pXHJcbiAqIEBwYXJhbSB1cmwgLSBQYXRoIHRvIHRoZSBzYXZlZCBmaWxlXHJcbiAqIEBwYXJhbSBzY2VuZSAtIE5hbWUgb2YgdGhlIHNjZW5lIHRvIGxvYWQgaWYgc2F2ZWQgbXVsdGlwbGUgc2NlbmVzXHJcbiAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5pbXBvcnQoT2JqZWN0IHNjZW5lRGF0YSlcclxuICogQHBhcmFtIHNjZW5lRGF0YSAtIFNjZW5lIGRhdGEgZ2VuZXJhdGVkIGZyb20gYnVpbGRlclxyXG4gKiBUaGlzIG1ldGhvZCB3aWxsIGxvYWQgaW4gc2NlbmUgZGF0YSBnZW5lcmF0ZWQgYnkgdGhlIENyYWZ0eSBCdWlsZGVyLlxyXG4gKlxyXG4gKiBAZXhhbXBsZVxyXG4gKiB+fn5cclxuICogQ3JhZnR5LmltcG9ydCh7XHJcbiAqXHQnMCc6IHtwcm9wczogdmFsdWV9LFxyXG4gKlx0J24nOiBbXHJcbiAqXHRcdHtjOiBcImNvbXAsIGxpc3RcIiwgaW1hZ2U6ICcnfVxyXG4gKlx0XVxyXG4gKiB9KTtcclxuICogfn5+XHJcbiAqL1xyXG5DcmFmdHlbJ2ltcG9ydCddID0gZnVuY3Rpb24gKG9iaiwgc2NlbmUpIHtcclxuICAgIC8vaWYgaXRzIGEgc3RyaW5nLCBsb2FkIHRoZSBzY3JpcHQgZmlsZVxyXG4gICAgaWYgKHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICBpZiAobGV2ZWxEYXRhKSB7XHJcbiAgICAgICAgICAgIGlmIChzY2VuZSkgQ3JhZnR5LmltcG9ydChsZXZlbERhdGFbc2NlbmVdKTtcclxuICAgICAgICAgICAgZWxzZSBDcmFmdHkuaW1wb3J0KGxldmVsRGF0YSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdmFyIGVsZW07XHJcbiAgICAgICAgICAgIGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgICAgICBlbGVtLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGlmIChzY2VuZSkgQ3JhZnR5LmltcG9ydChsZXZlbERhdGFbc2NlbmVdKTtcclxuICAgICAgICAgICAgICAgIGVsc2UgQ3JhZnR5LmltcG9ydChsZXZlbERhdGEpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBlbGVtLnNyYyA9IG9iajtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBrZXksIGkgPSAwLFxyXG4gICAgICAgIGwsIGN1cnJlbnQsIGVudDtcclxuXHJcbiAgICAvL2xvb3Agb3ZlciBuZXcgZW50aXRpZXMgdG8gY3JlYXRlXHJcbiAgICBpZiAob2JqLm4gJiYgdHlwZW9mIG9iai5uID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgZm9yIChsID0gb2JqLm4ubGVuZ3RoOyBpIDwgbDsgKytpKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnQgPSBvYmoubltpXTtcclxuXHJcbiAgICAgICAgICAgIC8vY3JlYXRlIGVudGl0eSB3aXRoIGNvbXBvbmVudHNcclxuICAgICAgICAgICAgZW50ID0gQ3JhZnR5LmUoY3VycmVudC5jKTtcclxuICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnQuYzsgLy9yZW1vdmUgdGhlIGNvbXBvbmVudHNcclxuXHJcbiAgICAgICAgICAgIC8vYXBwbHkgdGhlIG90aGVyIHByb3BlcnRpZXNcclxuICAgICAgICAgICAgZW50LmF0dHIoY3VycmVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vbG9vcCBvdmVyIG1vZGlmaWVkIGVudGl0aWVzXHJcbiAgICBmb3IgKGtleSBpbiBvYmopIHtcclxuICAgICAgICBlbnQgPSBDcmFmdHkoa2V5KTtcclxuICAgICAgICBlbnQuYXR0cihvYmpba2V5XSk7XHJcbiAgICB9XHJcbn07IiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5pc29tZXRyaWNcbiAgICAgKiBAY2F0ZWdvcnkgMkRcbiAgICAgKiBQbGFjZSBlbnRpdGllcyBpbiBhIDQ1ZGVnIGlzb21ldHJpYyBmYXNoaW9uLlxuICAgICAqL1xuICAgIGlzb21ldHJpYzoge1xuICAgICAgICBfdGlsZToge1xuICAgICAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IDBcbiAgICAgICAgfSxcbiAgICAgICAgX2VsZW1lbnRzOiB7fSxcbiAgICAgICAgX3Bvczoge1xuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDBcbiAgICAgICAgfSxcbiAgICAgICAgX3o6IDAsXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5pc29tZXRyaWMuc2l6ZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuaXNvbWV0cmljXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5pc29tZXRyaWMuc2l6ZShOdW1iZXIgdGlsZVNpemUpXG4gICAgICAgICAqIEBwYXJhbSB0aWxlU2l6ZSAtIFRoZSBzaXplIG9mIHRoZSB0aWxlcyB0byBwbGFjZS5cbiAgICAgICAgICpcbiAgICAgICAgICogTWV0aG9kIHVzZWQgdG8gaW5pdGlhbGl6ZSB0aGUgc2l6ZSBvZiB0aGUgaXNvbWV0cmljIHBsYWNlbWVudC5cbiAgICAgICAgICogUmVjb21tZW5kZWQgdG8gdXNlIGEgc2l6ZSB2YWx1ZXMgaW4gdGhlIHBvd2VyIG9mIGAyYCAoMTI4LCA2NCBvciAzMikuXG4gICAgICAgICAqIFRoaXMgbWFrZXMgaXQgZWFzeSB0byBjYWxjdWxhdGUgcG9zaXRpb25zIGFuZCBpbXBsZW1lbnQgem9vbWluZy5cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHZhciBpc28gPSBDcmFmdHkuaXNvbWV0cmljLnNpemUoMTI4KTtcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqIEBzZWUgQ3JhZnR5Lmlzb21ldHJpYy5wbGFjZVxuICAgICAgICAgKi9cbiAgICAgICAgc2l6ZTogZnVuY3Rpb24gKHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuX3RpbGUud2lkdGggPSB3aWR0aDtcbiAgICAgICAgICAgIHRoaXMuX3RpbGUuaGVpZ2h0ID0gaGVpZ2h0ID4gMCA/IGhlaWdodCA6IHdpZHRoIC8gMjsgLy9TZXR1cCB3aWR0aC8yIGlmIGhlaWdodCBpc24ndCBzZXRcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuaXNvbWV0cmljLnBsYWNlXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5pc29tZXRyaWNcbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5Lmlzb21ldHJpYy5wbGFjZShOdW1iZXIgeCwgTnVtYmVyIHksIE51bWJlciB6LCBFbnRpdHkgdGlsZSlcbiAgICAgICAgICogQHBhcmFtIHggLSBUaGUgYHhgIHBvc2l0aW9uIHRvIHBsYWNlIHRoZSB0aWxlXG4gICAgICAgICAqIEBwYXJhbSB5IC0gVGhlIGB5YCBwb3NpdGlvbiB0byBwbGFjZSB0aGUgdGlsZVxuICAgICAgICAgKiBAcGFyYW0geiAtIFRoZSBgemAgcG9zaXRpb24gb3IgaGVpZ2h0IHRvIHBsYWNlIHRoZSB0aWxlXG4gICAgICAgICAqIEBwYXJhbSB0aWxlIC0gVGhlIGVudGl0eSB0aGF0IHNob3VsZCBiZSBwb3NpdGlvbiBpbiB0aGUgaXNvbWV0cmljIGZhc2hpb25cbiAgICAgICAgICpcbiAgICAgICAgICogVXNlIHRoaXMgbWV0aG9kIHRvIHBsYWNlIGFuIGVudGl0eSBpbiBhbiBpc29tZXRyaWMgZ3JpZC5cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHZhciBpc28gPSBDcmFmdHkuaXNvbWV0cmljLnNpemUoMTI4KTtcbiAgICAgICAgICogaXNvLnBsYWNlKDIsIDEsIDAsIENyYWZ0eS5lKCcyRCwgRE9NLCBDb2xvcicpLmNvbG9yKCdyZWQnKS5hdHRyKHt3OjEyOCwgaDoxMjh9KSk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKlxuICAgICAgICAgKiBAc2VlIENyYWZ0eS5pc29tZXRyaWMuc2l6ZVxuICAgICAgICAgKi9cbiAgICAgICAgcGxhY2U6IGZ1bmN0aW9uICh4LCB5LCB6LCBvYmopIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnBvczJweCh4LCB5KTtcbiAgICAgICAgICAgIHBvcy50b3AgLT0geiAqICh0aGlzLl90aWxlLmhlaWdodCAvIDIpO1xuICAgICAgICAgICAgb2JqLmF0dHIoe1xuICAgICAgICAgICAgICAgIHg6IHBvcy5sZWZ0ICsgQ3JhZnR5LnZpZXdwb3J0Ll94LFxuICAgICAgICAgICAgICAgIHk6IHBvcy50b3AgKyBDcmFmdHkudmlld3BvcnQuX3lcbiAgICAgICAgICAgIH0pLnogKz0gejtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuaXNvbWV0cmljLnBvczJweFxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuaXNvbWV0cmljXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5pc29tZXRyaWMucG9zMnB4KE51bWJlciB4LE51bWJlciB5KVxuICAgICAgICAgKiBAcGFyYW0geFxuICAgICAgICAgKiBAcGFyYW0geVxuICAgICAgICAgKiBAcmV0dXJuIE9iamVjdCB7bGVmdCBOdW1iZXIsdG9wIE51bWJlcn1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyBtZXRob2QgY2FsY3VsYXRlIHRoZSBYIGFuZCBZIENvb3JkaW5hdGVzIHRvIFBpeGVsIFBvc2l0aW9uc1xuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogdmFyIGlzbyA9IENyYWZ0eS5pc29tZXRyaWMuc2l6ZSgxMjgsOTYpO1xuICAgICAgICAgKiB2YXIgcG9zaXRpb24gPSBpc28ucG9zMnB4KDEwMCwxMDApOyAvL09iamVjdCB7IGxlZnQ9MTI4MDAsIHRvcD00ODAwfVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHBvczJweDogZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGVmdDogeCAqIHRoaXMuX3RpbGUud2lkdGggKyAoeSAmIDEpICogKHRoaXMuX3RpbGUud2lkdGggLyAyKSxcbiAgICAgICAgICAgICAgICB0b3A6IHkgKiB0aGlzLl90aWxlLmhlaWdodCAvIDJcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5pc29tZXRyaWMucHgycG9zXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5pc29tZXRyaWNcbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5Lmlzb21ldHJpYy5weDJwb3MoTnVtYmVyIGxlZnQsTnVtYmVyIHRvcClcbiAgICAgICAgICogQHBhcmFtIHRvcFxuICAgICAgICAgKiBAcGFyYW0gbGVmdFxuICAgICAgICAgKiBAcmV0dXJuIE9iamVjdCB7eCBOdW1iZXIseSBOdW1iZXJ9XG4gICAgICAgICAqXG4gICAgICAgICAqIFRoaXMgbWV0aG9kIGNhbGN1bGF0ZSBwaXhlbCB0b3AsbGVmdCBwb3NpdGlvbnMgdG8geCx5IGNvb3JkaW5hdGVzXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiB2YXIgaXNvID0gQ3JhZnR5Lmlzb21ldHJpYy5zaXplKDEyOCw5Nik7XG4gICAgICAgICAqIHZhciBweCA9IGlzby5wb3MycHgoMTI4MDAsNDgwMCk7XG4gICAgICAgICAqIGNvbnNvbGUubG9nKHB4KTsgLy9PYmplY3QgeyB4PTEwMCwgeT0xMDB9XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKi9cbiAgICAgICAgcHgycG9zOiBmdW5jdGlvbiAobGVmdCwgdG9wKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHg6IC1NYXRoLmNlaWwoLWxlZnQgLyB0aGlzLl90aWxlLndpZHRoIC0gKHRvcCAmIDEpICogMC41KSxcbiAgICAgICAgICAgICAgICB5OiB0b3AgLyB0aGlzLl90aWxlLmhlaWdodCAqIDJcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5pc29tZXRyaWMuY2VudGVyQXRcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5Lmlzb21ldHJpY1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuaXNvbWV0cmljLmNlbnRlckF0KE51bWJlciB4LE51bWJlciB5KVxuICAgICAgICAgKiBAcGFyYW0gdG9wXG4gICAgICAgICAqIEBwYXJhbSBsZWZ0XG4gICAgICAgICAqXG4gICAgICAgICAqIFRoaXMgbWV0aG9kIGNlbnRlciB0aGUgVmlld3BvcnQgYXQgeC95IGxvY2F0aW9uIG9yIGdpdmVzIHRoZSBjdXJyZW50IGNlbnRlcnBvaW50IG9mIHRoZSB2aWV3cG9ydFxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogdmFyIGlzbyA9IENyYWZ0eS5pc29tZXRyaWMuc2l6ZSgxMjgsOTYpLmNlbnRlckF0KDEwLDEwKTsgLy9WaWV3cG9ydCBpcyBub3cgbW92ZWRcbiAgICAgICAgICogLy9BZnRlciBtb3ZpbmcgdGhlIHZpZXdwb3J0IGJ5IGFub3RoZXIgZXZlbnQgeW91IGNhbiBnZXQgdGhlIG5ldyBjZW50ZXIgcG9pbnRcbiAgICAgICAgICogY29uc29sZS5sb2coaXNvLmNlbnRlckF0KCkpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIGNlbnRlckF0OiBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB4ID09IFwibnVtYmVyXCIgJiYgdHlwZW9mIHkgPT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIHZhciBjZW50ZXIgPSB0aGlzLnBvczJweCh4LCB5KTtcbiAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQuX3ggPSAtY2VudGVyLmxlZnQgKyBDcmFmdHkudmlld3BvcnQud2lkdGggLyAyIC0gdGhpcy5fdGlsZS53aWR0aCAvIDI7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0Ll95ID0gLWNlbnRlci50b3AgKyBDcmFmdHkudmlld3BvcnQuaGVpZ2h0IC8gMiAtIHRoaXMuX3RpbGUuaGVpZ2h0IC8gMjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdG9wOiAtQ3JhZnR5LnZpZXdwb3J0Ll95ICsgQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCAvIDIgLSB0aGlzLl90aWxlLmhlaWdodCAvIDIsXG4gICAgICAgICAgICAgICAgICAgIGxlZnQ6IC1DcmFmdHkudmlld3BvcnQuX3ggKyBDcmFmdHkudmlld3BvcnQud2lkdGggLyAyIC0gdGhpcy5fdGlsZS53aWR0aCAvIDJcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuaXNvbWV0cmljLmFyZWFcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5Lmlzb21ldHJpY1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuaXNvbWV0cmljLmFyZWEoKVxuICAgICAgICAgKiBAcmV0dXJuIE9iamVjdCB7eDp7c3RhcnQgTnVtYmVyLGVuZCBOdW1iZXJ9LHk6e3N0YXJ0IE51bWJlcixlbmQgTnVtYmVyfX1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyBtZXRob2QgZ2V0IHRoZSBBcmVhIHN1cnJvdW5kaW5nIGJ5IHRoZSBjZW50ZXJwb2ludCBkZXBlbmRzIG9uIHZpZXdwb3J0IGhlaWdodCBhbmQgd2lkdGhcbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHZhciBpc28gPSBDcmFmdHkuaXNvbWV0cmljLnNpemUoMTI4LDk2KS5jZW50ZXJBdCgxMCwxMCk7IC8vVmlld3BvcnQgaXMgbm93IG1vdmVkXG4gICAgICAgICAqIHZhciBhcmVhID0gaXNvLmFyZWEoKTsgLy9nZXQgdGhlIGFyZWFcbiAgICAgICAgICogZm9yKHZhciB5ID0gYXJlYS55LnN0YXJ0O3kgPD0gYXJlYS55LmVuZDt5Kyspe1xuICAgICAgICAgKiAgIGZvcih2YXIgeCA9IGFyZWEueC5zdGFydCA7eCA8PSBhcmVhLnguZW5kO3grKyl7XG4gICAgICAgICAqICAgICAgIGlzby5wbGFjZSh4LHksMCxDcmFmdHkuZShcIjJELERPTSxncmFzXCIpKTsgLy9EaXNwbGF5IHRpbGVzIGluIHRoZSBTY3JlZW5cbiAgICAgICAgICogICB9XG4gICAgICAgICAqIH1cbiAgICAgICAgICogfn5+XG4gICAgICAgICAqL1xuICAgICAgICBhcmVhOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvL0dldCB0aGUgY2VudGVyIFBvaW50IGluIHRoZSB2aWV3cG9ydFxuICAgICAgICAgICAgdmFyIGNlbnRlciA9IHRoaXMuY2VudGVyQXQoKTtcbiAgICAgICAgICAgIHZhciBzdGFydCA9IHRoaXMucHgycG9zKC1jZW50ZXIubGVmdCArIENyYWZ0eS52aWV3cG9ydC53aWR0aCAvIDIsIC1jZW50ZXIudG9wICsgQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCAvIDIpO1xuICAgICAgICAgICAgdmFyIGVuZCA9IHRoaXMucHgycG9zKC1jZW50ZXIubGVmdCAtIENyYWZ0eS52aWV3cG9ydC53aWR0aCAvIDIsIC1jZW50ZXIudG9wIC0gQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCAvIDIpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydC54LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IGVuZC54XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB5OiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydC55LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IGVuZC55XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuIiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5rZXlzXG4gICAgICogQGNhdGVnb3J5IElucHV0XG4gICAgICogT2JqZWN0IG9mIGtleSBuYW1lcyBhbmQgdGhlIGNvcnJlc3BvbmRpbmcga2V5IGNvZGUuXG4gICAgICpcbiAgICAgKiB+fn5cbiAgICAgKiBCQUNLU1BBQ0U6IDgsXG4gICAgICogVEFCOiA5LFxuICAgICAqIEVOVEVSOiAxMyxcbiAgICAgKiBQQVVTRTogMTksXG4gICAgICogQ0FQUzogMjAsXG4gICAgICogRVNDOiAyNyxcbiAgICAgKiBTUEFDRTogMzIsXG4gICAgICogUEFHRV9VUDogMzMsXG4gICAgICogUEFHRV9ET1dOOiAzNCxcbiAgICAgKiBFTkQ6IDM1LFxuICAgICAqIEhPTUU6IDM2LFxuICAgICAqIExFRlRfQVJST1c6IDM3LFxuICAgICAqIFVQX0FSUk9XOiAzOCxcbiAgICAgKiBSSUdIVF9BUlJPVzogMzksXG4gICAgICogRE9XTl9BUlJPVzogNDAsXG4gICAgICogSU5TRVJUOiA0NSxcbiAgICAgKiBERUxFVEU6IDQ2LFxuICAgICAqIDA6IDQ4LFxuICAgICAqIDE6IDQ5LFxuICAgICAqIDI6IDUwLFxuICAgICAqIDM6IDUxLFxuICAgICAqIDQ6IDUyLFxuICAgICAqIDU6IDUzLFxuICAgICAqIDY6IDU0LFxuICAgICAqIDc6IDU1LFxuICAgICAqIDg6IDU2LFxuICAgICAqIDk6IDU3LFxuICAgICAqIEE6IDY1LFxuICAgICAqIEI6IDY2LFxuICAgICAqIEM6IDY3LFxuICAgICAqIEQ6IDY4LFxuICAgICAqIEU6IDY5LFxuICAgICAqIEY6IDcwLFxuICAgICAqIEc6IDcxLFxuICAgICAqIEg6IDcyLFxuICAgICAqIEk6IDczLFxuICAgICAqIEo6IDc0LFxuICAgICAqIEs6IDc1LFxuICAgICAqIEw6IDc2LFxuICAgICAqIE06IDc3LFxuICAgICAqIE46IDc4LFxuICAgICAqIE86IDc5LFxuICAgICAqIFA6IDgwLFxuICAgICAqIFE6IDgxLFxuICAgICAqIFI6IDgyLFxuICAgICAqIFM6IDgzLFxuICAgICAqIFQ6IDg0LFxuICAgICAqIFU6IDg1LFxuICAgICAqIFY6IDg2LFxuICAgICAqIFc6IDg3LFxuICAgICAqIFg6IDg4LFxuICAgICAqIFk6IDg5LFxuICAgICAqIFo6IDkwLFxuICAgICAqIE5VTVBBRF8wOiA5NixcbiAgICAgKiBOVU1QQURfMTogOTcsXG4gICAgICogTlVNUEFEXzI6IDk4LFxuICAgICAqIE5VTVBBRF8zOiA5OSxcbiAgICAgKiBOVU1QQURfNDogMTAwLFxuICAgICAqIE5VTVBBRF81OiAxMDEsXG4gICAgICogTlVNUEFEXzY6IDEwMixcbiAgICAgKiBOVU1QQURfNzogMTAzLFxuICAgICAqIE5VTVBBRF84OiAxMDQsXG4gICAgICogTlVNUEFEXzk6IDEwNSxcbiAgICAgKiBNVUxUSVBMWTogMTA2LFxuICAgICAqIEFERDogMTA3LFxuICAgICAqIFNVQlNUUkFDVDogMTA5LFxuICAgICAqIERFQ0lNQUw6IDExMCxcbiAgICAgKiBESVZJREU6IDExMSxcbiAgICAgKiBGMTogMTEyLFxuICAgICAqIEYyOiAxMTMsXG4gICAgICogRjM6IDExNCxcbiAgICAgKiBGNDogMTE1LFxuICAgICAqIEY1OiAxMTYsXG4gICAgICogRjY6IDExNyxcbiAgICAgKiBGNzogMTE4LFxuICAgICAqIEY4OiAxMTksXG4gICAgICogRjk6IDEyMCxcbiAgICAgKiBGMTA6IDEyMSxcbiAgICAgKiBGMTE6IDEyMixcbiAgICAgKiBGMTI6IDEyMyxcbiAgICAgKiBTSElGVDogMTYsXG4gICAgICogQ1RSTDogMTcsXG4gICAgICogQUxUOiAxOCxcbiAgICAgKiBQTFVTOiAxODcsXG4gICAgICogQ09NTUE6IDE4OCxcbiAgICAgKiBNSU5VUzogMTg5LFxuICAgICAqIFBFUklPRDogMTkwLFxuICAgICAqIFBVTFRfVVA6IDI5NDYwLFxuICAgICAqIFBVTFRfRE9XTjogMjk0NjEsXG4gICAgICogUFVMVF9MRUZUOiA0LFxuICAgICAqIFBVTFRfUklHSFQnOiA1XG4gICAgICogfn5+XG4gICAgICovXG4gICAga2V5czoge1xuICAgICAgICAnQkFDS1NQQUNFJzogOCxcbiAgICAgICAgJ1RBQic6IDksXG4gICAgICAgICdFTlRFUic6IDEzLFxuICAgICAgICAnUEFVU0UnOiAxOSxcbiAgICAgICAgJ0NBUFMnOiAyMCxcbiAgICAgICAgJ0VTQyc6IDI3LFxuICAgICAgICAnU1BBQ0UnOiAzMixcbiAgICAgICAgJ1BBR0VfVVAnOiAzMyxcbiAgICAgICAgJ1BBR0VfRE9XTic6IDM0LFxuICAgICAgICAnRU5EJzogMzUsXG4gICAgICAgICdIT01FJzogMzYsXG4gICAgICAgICdMRUZUX0FSUk9XJzogMzcsXG4gICAgICAgICdVUF9BUlJPVyc6IDM4LFxuICAgICAgICAnUklHSFRfQVJST1cnOiAzOSxcbiAgICAgICAgJ0RPV05fQVJST1cnOiA0MCxcbiAgICAgICAgJ0lOU0VSVCc6IDQ1LFxuICAgICAgICAnREVMRVRFJzogNDYsXG4gICAgICAgICcwJzogNDgsXG4gICAgICAgICcxJzogNDksXG4gICAgICAgICcyJzogNTAsXG4gICAgICAgICczJzogNTEsXG4gICAgICAgICc0JzogNTIsXG4gICAgICAgICc1JzogNTMsXG4gICAgICAgICc2JzogNTQsXG4gICAgICAgICc3JzogNTUsXG4gICAgICAgICc4JzogNTYsXG4gICAgICAgICc5JzogNTcsXG4gICAgICAgICdBJzogNjUsXG4gICAgICAgICdCJzogNjYsXG4gICAgICAgICdDJzogNjcsXG4gICAgICAgICdEJzogNjgsXG4gICAgICAgICdFJzogNjksXG4gICAgICAgICdGJzogNzAsXG4gICAgICAgICdHJzogNzEsXG4gICAgICAgICdIJzogNzIsXG4gICAgICAgICdJJzogNzMsXG4gICAgICAgICdKJzogNzQsXG4gICAgICAgICdLJzogNzUsXG4gICAgICAgICdMJzogNzYsXG4gICAgICAgICdNJzogNzcsXG4gICAgICAgICdOJzogNzgsXG4gICAgICAgICdPJzogNzksXG4gICAgICAgICdQJzogODAsXG4gICAgICAgICdRJzogODEsXG4gICAgICAgICdSJzogODIsXG4gICAgICAgICdTJzogODMsXG4gICAgICAgICdUJzogODQsXG4gICAgICAgICdVJzogODUsXG4gICAgICAgICdWJzogODYsXG4gICAgICAgICdXJzogODcsXG4gICAgICAgICdYJzogODgsXG4gICAgICAgICdZJzogODksXG4gICAgICAgICdaJzogOTAsXG4gICAgICAgICdOVU1QQURfMCc6IDk2LFxuICAgICAgICAnTlVNUEFEXzEnOiA5NyxcbiAgICAgICAgJ05VTVBBRF8yJzogOTgsXG4gICAgICAgICdOVU1QQURfMyc6IDk5LFxuICAgICAgICAnTlVNUEFEXzQnOiAxMDAsXG4gICAgICAgICdOVU1QQURfNSc6IDEwMSxcbiAgICAgICAgJ05VTVBBRF82JzogMTAyLFxuICAgICAgICAnTlVNUEFEXzcnOiAxMDMsXG4gICAgICAgICdOVU1QQURfOCc6IDEwNCxcbiAgICAgICAgJ05VTVBBRF85JzogMTA1LFxuICAgICAgICAnTVVMVElQTFknOiAxMDYsXG4gICAgICAgICdBREQnOiAxMDcsXG4gICAgICAgICdTVUJTVFJBQ1QnOiAxMDksXG4gICAgICAgICdERUNJTUFMJzogMTEwLFxuICAgICAgICAnRElWSURFJzogMTExLFxuICAgICAgICAnRjEnOiAxMTIsXG4gICAgICAgICdGMic6IDExMyxcbiAgICAgICAgJ0YzJzogMTE0LFxuICAgICAgICAnRjQnOiAxMTUsXG4gICAgICAgICdGNSc6IDExNixcbiAgICAgICAgJ0Y2JzogMTE3LFxuICAgICAgICAnRjcnOiAxMTgsXG4gICAgICAgICdGOCc6IDExOSxcbiAgICAgICAgJ0Y5JzogMTIwLFxuICAgICAgICAnRjEwJzogMTIxLFxuICAgICAgICAnRjExJzogMTIyLFxuICAgICAgICAnRjEyJzogMTIzLFxuICAgICAgICAnU0hJRlQnOiAxNixcbiAgICAgICAgJ0NUUkwnOiAxNyxcbiAgICAgICAgJ0FMVCc6IDE4LFxuICAgICAgICAnUExVUyc6IDE4NyxcbiAgICAgICAgJ0NPTU1BJzogMTg4LFxuICAgICAgICAnTUlOVVMnOiAxODksXG4gICAgICAgICdQRVJJT0QnOiAxOTAsXG4gICAgICAgICdQVUxUX1VQJzogMjk0NjAsXG4gICAgICAgICdQVUxUX0RPV04nOiAyOTQ2MSxcbiAgICAgICAgJ1BVTFRfTEVGVCc6IDQsXG4gICAgICAgICdQVUxUX1JJR0hUJzogNVxuXG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1vdXNlQnV0dG9uc1xuICAgICAqIEBjYXRlZ29yeSBJbnB1dFxuICAgICAqIEFuIG9iamVjdCBtYXBwaW5nIG1vdXNlQnV0dG9uIG5hbWVzIHRvIHRoZSBjb3JyZXNwb25kaW5nIGJ1dHRvbiBJRC5cbiAgICAgKiBJbiBhbGwgbW91c2VFdmVudHMsIHdlIGFkZCB0aGUgYGUubW91c2VCdXR0b25gIHByb3BlcnR5IHdpdGggYSB2YWx1ZSBub3JtYWxpemVkIHRvIG1hdGNoIGUuYnV0dG9uIG9mIG1vZGVybiB3ZWJraXQgYnJvd3NlcnM6XG4gICAgICpcbiAgICAgKiB+fn5cbiAgICAgKiBMRUZUOiAwLFxuICAgICAqIE1JRERMRTogMSxcbiAgICAgKiBSSUdIVDogMlxuICAgICAqIH5+flxuICAgICAqL1xuICAgIG1vdXNlQnV0dG9uczoge1xuICAgICAgICBMRUZUOiAwLFxuICAgICAgICBNSURETEU6IDEsXG4gICAgICAgIFJJR0hUOiAyXG4gICAgfVxufSk7IiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG5DcmFmdHkuZXh0ZW5kKHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5hc3NldHNcbiAgICAgKiBAY2F0ZWdvcnkgQXNzZXRzXG4gICAgICogQW4gb2JqZWN0IGNvbnRhaW5pbmcgZXZlcnkgYXNzZXQgdXNlZCBpbiB0aGUgY3VycmVudCBDcmFmdHkgZ2FtZS5cbiAgICAgKiBUaGUga2V5IGlzIHRoZSBVUkwgYW5kIHRoZSB2YWx1ZSBpcyB0aGUgYEF1ZGlvYCBvciBgSW1hZ2VgIG9iamVjdC5cbiAgICAgKlxuICAgICAqIElmIGxvYWRpbmcgYW4gYXNzZXQsIGNoZWNrIHRoYXQgaXQgaXMgaW4gdGhpcyBvYmplY3QgZmlyc3QgdG8gYXZvaWQgbG9hZGluZyB0d2ljZS5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogdmFyIGlzTG9hZGVkID0gISFDcmFmdHkuYXNzZXRzW1wiaW1hZ2VzL3Nwcml0ZS5wbmdcIl07XG4gICAgICogfn5+XG4gICAgICogQHNlZSBDcmFmdHkubG9hZGVyXG4gICAgICovXG4gICAgYXNzZXRzOiB7fSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmFzc2V0XG4gICAgICogQGNhdGVnb3J5IEFzc2V0c1xuICAgICAqXG4gICAgICogQHRyaWdnZXIgTmV3QXNzZXQgLSBBZnRlciBzZXR0aW5nIG5ldyBhc3NldCAtIE9iamVjdCAtIGtleSBhbmQgdmFsdWUgb2YgbmV3IGFkZGVkIGFzc2V0LlxuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5hc3NldChTdHJpbmcga2V5LCBPYmplY3QgYXNzZXQpXG4gICAgICogQHBhcmFtIGtleSAtIGFzc2V0IHVybC5cbiAgICAgKiBAcGFyYW0gYXNzZXQgLSBBdWRpb2Agb3IgYEltYWdlYCBvYmplY3QuXG4gICAgICogQWRkIG5ldyBhc3NldCB0byBhc3NldHMgb2JqZWN0LlxuICAgICAqXG4gICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5LmFzc2V0KFN0cmluZyBrZXkpXG4gICAgICogQHBhcmFtIGtleSAtIGFzc2V0IHVybC5cbiAgICAgKiBHZXQgYXNzZXQgZnJvbSBhc3NldHMgb2JqZWN0LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuYXNzZXQoa2V5LCB2YWx1ZSk7XG4gICAgICogdmFyIGFzc2V0ID0gQ3JhZnR5LmFzc2V0KGtleSk7IC8vb2JqZWN0IHdpdGgga2V5IGFuZCB2YWx1ZSBmaWVsZHNcbiAgICAgKiB+fn5cbiAgICAgKlxuICAgICAqIEBzZWUgQ3JhZnR5LmFzc2V0c1xuICAgICAqL1xuICAgIGFzc2V0OiBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIENyYWZ0eS5hc3NldHNba2V5XTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghQ3JhZnR5LmFzc2V0c1trZXldKSB7XG4gICAgICAgICAgICBDcmFmdHkuYXNzZXRzW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIk5ld0Fzc2V0XCIsIHtcbiAgICAgICAgICAgICAgICBrZXk6IGtleSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgfSxcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5pbWFnZV93aGl0ZWxpc3RcbiAgICAgKiBAY2F0ZWdvcnkgQXNzZXRzXG4gICAgICpcbiAgICAgKlxuICAgICAqIEEgbGlzdCBvZiBmaWxlIGV4dGVuc2lvbnMgdGhhdCBjYW4gYmUgbG9hZGVkIGFzIGltYWdlcyBieSBDcmFmdHkubG9hZFxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuaW1hZ2Vfd2hpdGVsaXN0LnB1c2goXCJ0aWZcIilcbiAgICAgKiBDcmFmdHkubG9hZChbXCJpbWFnZXMvc3ByaXRlLnRpZlwiLCBcInNvdW5kcy9qdW1wLm1wM1wiXSxcbiAgICAgKiAgICAgZnVuY3Rpb24oKSB7XG4gICAgICogICAgICAgICAvL3doZW4gbG9hZGVkXG4gICAgICogICAgICAgICBDcmFmdHkuc2NlbmUoXCJtYWluXCIpOyAvL2dvIHRvIG1haW4gc2NlbmVcbiAgICAgKiAgICAgICAgIENyYWZ0eS5hdWRpby5wbGF5KFwianVtcC5tcDNcIik7IC8vUGxheSB0aGUgYXVkaW8gZmlsZVxuICAgICAqICAgICB9LFxuICAgICAqXG4gICAgICogICAgIGZ1bmN0aW9uKGUpIHtcbiAgICAgKiAgICAgICAvL3Byb2dyZXNzXG4gICAgICogICAgIH0sXG4gICAgICpcbiAgICAgKiAgICAgZnVuY3Rpb24oZSkge1xuICAgICAqICAgICAgIC8vdWggb2gsIGVycm9yIGxvYWRpbmdcbiAgICAgKiAgICAgfVxuICAgICAqICk7XG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBAc2VlIENyYWZ0eS5hc3NldFxuICAgICAqIEBzZWUgQ3JhZnR5LmxvYWRcbiAgICAgKi9cbiAgICBpbWFnZV93aGl0ZWxpc3Q6IFtcImpwZ1wiLCBcImpwZWdcIiwgXCJnaWZcIiwgXCJwbmdcIiwgXCJzdmdcIl0sXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkubG9hZGVyXG4gICAgICogQGNhdGVnb3J5IEFzc2V0c1xuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5sb2FkKEFycmF5IGFzc2V0cywgRnVuY3Rpb24gb25Mb2FkWywgRnVuY3Rpb24gb25Qcm9ncmVzcywgRnVuY3Rpb24gb25FcnJvcl0pXG4gICAgICogQHBhcmFtIGFzc2V0cyAtIEFycmF5IG9mIGFzc2V0cyB0byBsb2FkIChhY2NlcHRzIHNvdW5kcyBhbmQgaW1hZ2VzKVxuICAgICAqIEBwYXJhbSBvbkxvYWQgLSBDYWxsYmFjayB3aGVuIHRoZSBhc3NldHMgYXJlIGxvYWRlZFxuICAgICAqIEBwYXJhbSBvblByb2dyZXNzIC0gQ2FsbGJhY2sgd2hlbiBhbiBhc3NldCBpcyBsb2FkZWQuIENvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IGFzc2V0cyBsb2FkZWRcbiAgICAgKiBAcGFyYW0gb25FcnJvciAtIENhbGxiYWNrIHdoZW4gYW4gYXNzZXQgZmFpbHMgdG8gbG9hZFxuICAgICAqXG4gICAgICogUHJlbG9hZGVyIGZvciBhbGwgYXNzZXRzLiBUYWtlcyBhbiBhcnJheSBvZiBVUkxzIGFuZFxuICAgICAqIGFkZHMgdGhlbSB0byB0aGUgYENyYWZ0eS5hc3NldHNgIG9iamVjdC5cbiAgICAgKlxuICAgICAqIEZpbGVzIHdpdGggc3VmZml4ZXMgaW4gYGltYWdlX3doaXRlbGlzdGAgKGNhc2UgaW5zZW5zaXRpdmUpIHdpbGwgYmUgbG9hZGVkLlxuICAgICAqXG4gICAgICogSWYgYENyYWZ0eS5zdXBwb3J0LmF1ZGlvYCBpcyBgdHJ1ZWAsIGZpbGVzIHdpdGggdGhlIGZvbGxvd2luZyBzdWZmaXhlcyBgbXAzYCwgYHdhdmAsIGBvZ2dgIGFuZCBgbXA0YCAoY2FzZSBpbnNlbnNpdGl2ZSkgY2FuIGJlIGxvYWRlZC5cbiAgICAgKlxuICAgICAqIFRoZSBgb25Qcm9ncmVzc2AgZnVuY3Rpb24gd2lsbCBiZSBwYXNzZWQgb24gb2JqZWN0IHdpdGggaW5mb3JtYXRpb24gYWJvdXRcbiAgICAgKiB0aGUgcHJvZ3Jlc3MgaW5jbHVkaW5nIGhvdyBtYW55IGFzc2V0cyBsb2FkZWQsIHRvdGFsIG9mIGFsbCB0aGUgYXNzZXRzIHRvXG4gICAgICogbG9hZCBhbmQgYSBwZXJjZW50YWdlIG9mIHRoZSBwcm9ncmVzcy5cbiAgICAgKiB+fn5cbiAgICAgKiB7IGxvYWRlZDogaiwgdG90YWw6IHRvdGFsLCBwZXJjZW50OiAoaiAvIHRvdGFsICogMTAwKSAsc3JjOnNyY30pXG4gICAgICogfn5+XG4gICAgICpcbiAgICAgKiBgb25FcnJvcmAgd2lsbCBiZSBwYXNzZWQgd2l0aCB0aGUgYXNzZXQgdGhhdCBjb3VsZG4ndCBsb2FkLlxuICAgICAqXG4gICAgICogV2hlbiBgb25FcnJvcmAgaXMgbm90IHByb3ZpZGVkLCB0aGUgb25Mb2FkIGlzIGxvYWRlZCBldmVuIHNvbWUgYXNzZXRzIGFyZSBub3Qgc3VjY2Vzc2Z1bGx5IGxvYWRlZC4gT3RoZXJ3aXNlLCBvbkxvYWQgd2lsbCBiZSBjYWxsZWQgbm8gbWF0dGVyIHdoZXRoZXIgdGhlcmUgYXJlIGVycm9ycyBvciBub3QuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5sb2FkKFtcImltYWdlcy9zcHJpdGUucG5nXCIsIFwic291bmRzL2p1bXAubXAzXCJdLFxuICAgICAqICAgICBmdW5jdGlvbigpIHtcbiAgICAgKiAgICAgICAgIC8vd2hlbiBsb2FkZWRcbiAgICAgKiAgICAgICAgIENyYWZ0eS5zY2VuZShcIm1haW5cIik7IC8vZ28gdG8gbWFpbiBzY2VuZVxuICAgICAqICAgICAgICAgQ3JhZnR5LmF1ZGlvLnBsYXkoXCJqdW1wLm1wM1wiKTsgLy9QbGF5IHRoZSBhdWRpbyBmaWxlXG4gICAgICogICAgIH0sXG4gICAgICpcbiAgICAgKiAgICAgZnVuY3Rpb24oZSkge1xuICAgICAqICAgICAgIC8vcHJvZ3Jlc3NcbiAgICAgKiAgICAgfSxcbiAgICAgKlxuICAgICAqICAgICBmdW5jdGlvbihlKSB7XG4gICAgICogICAgICAgLy91aCBvaCwgZXJyb3IgbG9hZGluZ1xuICAgICAqICAgICB9XG4gICAgICogKTtcbiAgICAgKiB+fn5cbiAgICAgKlxuICAgICAqIEBzZWUgQ3JhZnR5LmFzc2V0c1xuICAgICAqIEBzZWUgQ3JhZnR5LmltYWdlX3doaXRlbGlzdFxuICAgICAqL1xuICAgIGxvYWQ6IGZ1bmN0aW9uIChkYXRhLCBvbmNvbXBsZXRlLCBvbnByb2dyZXNzLCBvbmVycm9yKSB7XG5cbiAgICAgICAgdmFyIGkgPSAwLFxuICAgICAgICAgICAgbCA9IGRhdGEubGVuZ3RoLFxuICAgICAgICAgICAgY3VycmVudCwgb2JqLCB0b3RhbCA9IGwsXG4gICAgICAgICAgICBqID0gMCxcbiAgICAgICAgICAgIGV4dCA9IFwiXCI7XG5cbiAgICAgICAgLy9Qcm9ncmVzcyBmdW5jdGlvblxuXG4gICAgICAgIGZ1bmN0aW9uIHBybygpIHtcbiAgICAgICAgICAgIHZhciBzcmMgPSB0aGlzLnNyYztcblxuICAgICAgICAgICAgLy9SZW1vdmUgZXZlbnRzIGNhdXNlIGF1ZGlvIHRyaWdnZXIgdGhpcyBldmVudCBtb3JlIHRoYW4gb25jZShkZXBlbmRzIG9uIGJyb3dzZXIpXG4gICAgICAgICAgICBpZiAodGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKCdjYW5wbGF5dGhyb3VnaCcsIHBybywgZmFsc2UpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICArK2o7XG4gICAgICAgICAgICAvL2lmIHByb2dyZXNzIGNhbGxiYWNrLCBnaXZlIGluZm9ybWF0aW9uIG9mIGFzc2V0cyBsb2FkZWQsIHRvdGFsIGFuZCBwZXJjZW50XG4gICAgICAgICAgICBpZiAob25wcm9ncmVzcylcbiAgICAgICAgICAgICAgICBvbnByb2dyZXNzKHtcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVkOiBqLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbDogdG90YWwsXG4gICAgICAgICAgICAgICAgICAgIHBlcmNlbnQ6IChqIC8gdG90YWwgKiAxMDApLFxuICAgICAgICAgICAgICAgICAgICBzcmM6IHNyY1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoaiA9PT0gdG90YWwgJiYgb25jb21wbGV0ZSkgb25jb21wbGV0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIC8vRXJyb3IgZnVuY3Rpb25cblxuICAgICAgICBmdW5jdGlvbiBlcnIoKSB7XG4gICAgICAgICAgICB2YXIgc3JjID0gdGhpcy5zcmM7XG4gICAgICAgICAgICBpZiAob25lcnJvcilcbiAgICAgICAgICAgICAgICBvbmVycm9yKHtcbiAgICAgICAgICAgICAgICAgICAgbG9hZGVkOiBqLFxuICAgICAgICAgICAgICAgICAgICB0b3RhbDogdG90YWwsXG4gICAgICAgICAgICAgICAgICAgIHBlcmNlbnQ6IChqIC8gdG90YWwgKiAxMDApLFxuICAgICAgICAgICAgICAgICAgICBzcmM6IHNyY1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBqKys7XG4gICAgICAgICAgICBpZiAoaiA9PT0gdG90YWwgJiYgb25jb21wbGV0ZSkgb25jb21wbGV0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICg7IGkgPCBsOyArK2kpIHtcbiAgICAgICAgICAgIGN1cnJlbnQgPSBkYXRhW2ldO1xuICAgICAgICAgICAgZXh0ID0gY3VycmVudC5zdWJzdHIoY3VycmVudC5sYXN0SW5kZXhPZignLicpICsgMSwgMykudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgb2JqID0gQ3JhZnR5LmFzc2V0KGN1cnJlbnQpIHx8IG51bGw7XG5cbiAgICAgICAgICAgIGlmIChDcmFmdHkuYXVkaW8uc3VwcG9ydHMoZXh0KSkge1xuICAgICAgICAgICAgICAgIC8vQ3JlYXRlIGEgbmV3IGFzc2V0IGlmIG5lY2Vzc2FyeSwgdXNpbmcgdGhlIGZpbGUgbmFtZSBhcyBhbiBpZFxuICAgICAgICAgICAgICAgIGlmICghb2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gY3VycmVudC5zdWJzdHIoY3VycmVudC5sYXN0SW5kZXhPZignLycpICsgMSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gQ3JhZnR5LmF1ZGlvLmNyZWF0ZShuYW1lLCBjdXJyZW50KS5vYmo7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9hZGRFdmVudExpc3RlbmVyIGlzIHN1cHBvcnRlZCBvbiBJRTkgLCBBdWRpbyBhcyB3ZWxsXG4gICAgICAgICAgICAgICAgaWYgKG9iai5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIG9iai5hZGRFdmVudExpc3RlbmVyKCdjYW5wbGF5dGhyb3VnaCcsIHBybywgZmFsc2UpO1xuICAgICAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKENyYWZ0eS5pbWFnZV93aGl0ZWxpc3QuaW5kZXhPZihleHQpID49IDApIHtcbiAgICAgICAgICAgICAgICBpZiAoIW9iaikge1xuICAgICAgICAgICAgICAgICAgICBvYmogPSBuZXcgSW1hZ2UoKTtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LmFzc2V0KGN1cnJlbnQsIG9iaik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9iai5vbmxvYWQgPSBwcm87XG4gICAgICAgICAgICAgICAgaWYgKENyYWZ0eS5zdXBwb3J0LnByZWZpeCA9PT0gJ3dlYmtpdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqLnNyYyA9IFwiXCI7IC8vIHdvcmthcm91bmQgZm9yIHdlYmtpdCBidWdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb2JqLnNyYyA9IGN1cnJlbnQ7IC8vc2V0dXAgc3JjIGFmdGVyIG9ubG9hZCBmdW5jdGlvbiBPcGVyYS9JRSBCdWdcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b3RhbC0tO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAvL3NraXAgaWYgbm90IGFwcGxpY2FibGVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9iai5vbmVycm9yID0gZXJyO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UgYXJlbid0IHRyeWluZyB0byBoYW5kbGUgKmFueSogb2YgdGhlIGZpbGVzLCB0aGF0J3MgYXMgY29tcGxldGUgYXMgaXQgZ2V0cyFcbiAgICAgICAgaWYgKHRvdGFsID09PSAwKVxuICAgICAgICAgICAgb25jb21wbGV0ZSgpO1xuXG4gICAgfSxcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tb2R1bGVzXG4gICAgICogQGNhdGVnb3J5IEFzc2V0c1xuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5tb2R1bGVzKFtTdHJpbmcgcmVwb0xvY2F0aW9uLF0gT2JqZWN0IG1vZHVsZU1hcFssIEZ1bmN0aW9uIG9uTG9hZF0pXG4gICAgICogQHBhcmFtIG1vZHVsZXMgLSBNYXAgb2YgbmFtZTp2ZXJzaW9uIHBhaXJzIGZvciBtb2R1bGVzIHRvIGxvYWRcbiAgICAgKiBAcGFyYW0gb25Mb2FkIC0gQ2FsbGJhY2sgd2hlbiB0aGUgbW9kdWxlcyBhcmUgbG9hZGVkXG4gICAgICpcbiAgICAgKiBCcm93c2UgdGhlIHNlbGVjdGlvbiBvZiBjb21tdW5pdHkgbW9kdWxlcyBvbiBodHRwOi8vY3JhZnR5Y29tcG9uZW50cy5jb21cbiAgICAgKlxuICAgICAqIEl0IGlzIHBvc3NpYmxlIHRvIGNyZWF0ZSB5b3VyIG93biByZXBvc2l0b3J5LlxuICAgICAqXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIC8vIExvYWRpbmcgZnJvbSBkZWZhdWx0IHJlcG9zaXRvcnlcbiAgICAgKiBDcmFmdHkubW9kdWxlcyh7IG1vdmV0bzogJ0RFVicgfSwgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICAvL21vZHVsZSBpcyByZWFkeVxuICAgICAqICAgICBDcmFmdHkuZShcIk1vdmVUbywgMkQsIERPTVwiKTtcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIC8vIExvYWRpbmcgZnJvbSB5b3VyIG93biBzZXJ2ZXJcbiAgICAgKiBDcmFmdHkubW9kdWxlcyh7ICdodHRwOi8vbXlkb21haW4uY29tL2pzL215c3R1ZmYuanMnOiAnREVWJyB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICogICAgIC8vbW9kdWxlIGlzIHJlYWR5XG4gICAgICogICAgIENyYWZ0eS5lKFwiTW92ZVRvLCAyRCwgRE9NXCIpO1xuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogLy8gTG9hZGluZyBmcm9tIGFsdGVybmF0aXZlIHJlcG9zaXRvcnlcbiAgICAgKiBDcmFmdHkubW9kdWxlcygnaHR0cDovL2Nkbi5jcmFmdHktbW9kdWxlcy5jb20nLCB7IG1vdmV0bzogJ0RFVicgfSwgZnVuY3Rpb24gKCkge1xuICAgICAqICAgICAvL21vZHVsZSBpcyByZWFkeVxuICAgICAqICAgICBDcmFmdHkuZShcIk1vdmVUbywgMkQsIERPTVwiKTtcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIC8vIExvYWRpbmcgZnJvbSB0aGUgbGF0ZXN0IGNvbXBvbmVudCB3ZWJzaXRlXG4gICAgICogQ3JhZnR5Lm1vZHVsZXMoXG4gICAgICogICAgICdodHRwOi8vY2RuLmNyYWZ0eWNvbXBvbmVudHMuY29tJ1xuICAgICAqICAgICAsIHsgTW92ZVRvOiAncmVsZWFzZScgfVxuICAgICAqICAgICAsIGZ1bmN0aW9uICgpIHtcbiAgICAgKiAgICAgQ3JhZnR5LmUoXCIyRCwgRE9NLCBDb2xvciwgTW92ZVRvXCIpXG4gICAgICogICAgICAgLmF0dHIoe3g6IDAsIHk6IDAsIHc6IDUwLCBoOiA1MH0pXG4gICAgICogICAgICAgLmNvbG9yKFwiZ3JlZW5cIik7XG4gICAgICogICAgIH0pO1xuICAgICAqIH0pO1xuICAgICAqIH5+flxuICAgICAqXG4gICAgICovXG4gICAgbW9kdWxlczogZnVuY3Rpb24gKG1vZHVsZXNSZXBvc2l0b3J5LCBtb2R1bGVNYXAsIG9uY29tcGxldGUpIHtcblxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMiAmJiB0eXBlb2YgbW9kdWxlc1JlcG9zaXRvcnkgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIG9uY29tcGxldGUgPSBtb2R1bGVNYXA7XG4gICAgICAgICAgICBtb2R1bGVNYXAgPSBtb2R1bGVzUmVwb3NpdG9yeTtcbiAgICAgICAgICAgIG1vZHVsZXNSZXBvc2l0b3J5ID0gJ2h0dHA6Ly9jZG4uY3JhZnR5Y29tcG9uZW50cy5jb20nO1xuICAgICAgICB9XG5cbiAgICAgICAgLyohXG4gICAgICAgICAqICRzY3JpcHQuanMgQXN5bmMgbG9hZGVyICYgZGVwZW5kZW5jeSBtYW5hZ2VyXG4gICAgICAgICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9kZWQvc2NyaXB0LmpzXG4gICAgICAgICAqIChjKSBEdXN0aW4gRGlheiwgSmFjb2IgVGhvcm50b24gMjAxMVxuICAgICAgICAgKiBMaWNlbnNlOiBNSVRcbiAgICAgICAgICovXG4gICAgICAgIHZhciAkc2NyaXB0ID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB3aW4gPSB0aGlzLFxuICAgICAgICAgICAgICAgIGRvYyA9IGRvY3VtZW50LFxuICAgICAgICAgICAgICAgIGhlYWQgPSBkb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXSxcbiAgICAgICAgICAgICAgICB2YWxpZEJhc2UgPSAvXmh0dHBzPzpcXC9cXC8vLFxuICAgICAgICAgICAgICAgIG9sZCA9IHdpbi4kc2NyaXB0LFxuICAgICAgICAgICAgICAgIGxpc3QgPSB7fSwgaWRzID0ge30sIGRlbGF5ID0ge30sIHNjcmlwdHBhdGgsIHNjcmlwdHMgPSB7fSwgcyA9ICdzdHJpbmcnLFxuICAgICAgICAgICAgICAgIGYgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBwdXNoID0gJ3B1c2gnLFxuICAgICAgICAgICAgICAgIGRvbUNvbnRlbnRMb2FkZWQgPSAnRE9NQ29udGVudExvYWRlZCcsXG4gICAgICAgICAgICAgICAgcmVhZHlTdGF0ZSA9ICdyZWFkeVN0YXRlJyxcbiAgICAgICAgICAgICAgICBhZGRFdmVudExpc3RlbmVyID0gJ2FkZEV2ZW50TGlzdGVuZXInLFxuICAgICAgICAgICAgICAgIG9ucmVhZHlzdGF0ZWNoYW5nZSA9ICdvbnJlYWR5c3RhdGVjaGFuZ2UnO1xuXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gZXZlcnkoYXIsIGZuLCBpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDAsIGogPSBhci5sZW5ndGg7IGkgPCBqOyArK2kpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWZuKGFyW2ldKSkgcmV0dXJuIGY7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGVhY2goYXIsIGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZXJ5KGFyLCBmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAhZm4oZWwpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZG9jW3JlYWR5U3RhdGVdICYmIGRvY1thZGRFdmVudExpc3RlbmVyXSkge1xuICAgICAgICAgICAgICAgIGRvY1thZGRFdmVudExpc3RlbmVyXShkb21Db250ZW50TG9hZGVkLCBmdW5jdGlvbiBmbigpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoZG9tQ29udGVudExvYWRlZCwgZm4sIGYpO1xuICAgICAgICAgICAgICAgICAgICBkb2NbcmVhZHlTdGF0ZV0gPSAnY29tcGxldGUnO1xuICAgICAgICAgICAgICAgIH0sIGYpO1xuICAgICAgICAgICAgICAgIGRvY1tyZWFkeVN0YXRlXSA9ICdsb2FkaW5nJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gJHNjcmlwdChwYXRocywgaWRPckRvbmUsIG9wdERvbmUpIHtcbiAgICAgICAgICAgICAgICBwYXRocyA9IHBhdGhzW3B1c2hdID8gcGF0aHMgOiBbcGF0aHNdO1xuICAgICAgICAgICAgICAgIHZhciBpZE9yRG9uZUlzRG9uZSA9IGlkT3JEb25lICYmIGlkT3JEb25lLmNhbGwsXG4gICAgICAgICAgICAgICAgICAgIGRvbmUgPSBpZE9yRG9uZUlzRG9uZSA/IGlkT3JEb25lIDogb3B0RG9uZSxcbiAgICAgICAgICAgICAgICAgICAgaWQgPSBpZE9yRG9uZUlzRG9uZSA/IHBhdGhzLmpvaW4oJycpIDogaWRPckRvbmUsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXVlID0gcGF0aHMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGxvb3BGbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXRlbS5jYWxsID8gaXRlbSgpIDogbGlzdFtpdGVtXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGNhbGxiYWNrKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEtLXF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdFtpZF0gPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkb25lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb25lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgZHNldCBpbiBkZWxheSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXZlcnkoZHNldC5zcGxpdCgnfCcpLCBsb29wRm4pICYmICFlYWNoKGRlbGF5W2RzZXRdLCBsb29wRm4pKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsYXlbZHNldF0gPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgZWFjaChwYXRocywgZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzY3JpcHRzW3BhdGhdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZHNbaWRdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2NyaXB0c1twYXRoXSA9PSAyICYmIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JpcHRzW3BhdGhdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZHNbaWRdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZSghdmFsaWRCYXNlLnRlc3QocGF0aCkgJiYgc2NyaXB0cGF0aCA/IHNjcmlwdHBhdGggKyBwYXRoICsgJy5qcycgOiBwYXRoLCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgICAgIHJldHVybiAkc2NyaXB0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBjcmVhdGUocGF0aCwgZm4pIHtcbiAgICAgICAgICAgICAgICB2YXIgZWwgPSBkb2MuY3JlYXRlRWxlbWVudCgnc2NyaXB0JyksXG4gICAgICAgICAgICAgICAgICAgIGxvYWRlZCA9IGY7XG4gICAgICAgICAgICAgICAgICAgIGVsLm9ubG9hZCA9IGVsLm9uZXJyb3IgPSBlbFtvbnJlYWR5c3RhdGVjaGFuZ2VdID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKChlbFtyZWFkeVN0YXRlXSAmJiAhKC9eY3xsb2FkZS8udGVzdChlbFtyZWFkeVN0YXRlXSkpKSB8fCBsb2FkZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLm9ubG9hZCA9IGVsW29ucmVhZHlzdGF0ZWNoYW5nZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9hZGVkID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcmlwdHNbcGF0aF0gPSAyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBlbC5hc3luYyA9IDE7XG4gICAgICAgICAgICAgICAgZWwuc3JjID0gcGF0aDtcbiAgICAgICAgICAgICAgICBoZWFkLmluc2VydEJlZm9yZShlbCwgaGVhZC5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgJHNjcmlwdC5nZXQgPSBjcmVhdGU7XG5cbiAgICAgICAgICAgICRzY3JpcHQub3JkZXIgPSBmdW5jdGlvbiAoc2NyaXB0cywgaWQsIGRvbmUpIHtcbiAgICAgICAgICAgICAgICAoZnVuY3Rpb24gY2FsbGJhY2socykge1xuICAgICAgICAgICAgICAgICAgICBzID0gc2NyaXB0cy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjcmlwdHMubGVuZ3RoKSAkc2NyaXB0KHMsIGlkLCBkb25lKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZSAkc2NyaXB0KHMsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9KCkpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgJHNjcmlwdC5wYXRoID0gZnVuY3Rpb24gKHApIHtcbiAgICAgICAgICAgICAgICBzY3JpcHRwYXRoID0gcDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGlzIGEgdGFuZ2xlZCBtZXNzIG9mIGNvbmNpc2VuZXNzLCBzbyBzdXBwcmVzcyB3YXJuaW5ncyBoZXJlXG4gICAgICAgICAgICAvKiBqc2hpbnQgLVcwMzAgKi9cbiAgICAgICAgICAgICRzY3JpcHQucmVhZHkgPSBmdW5jdGlvbiAoZGVwcywgcmVhZHksIHJlcSkge1xuICAgICAgICAgICAgICAgIGRlcHMgPSBkZXBzW3B1c2hdID8gZGVwcyA6IFtkZXBzXTtcbiAgICAgICAgICAgICAgICB2YXIgbWlzc2luZyA9IFtdO1xuICAgICAgICAgICAgICAgICFlYWNoKGRlcHMsIGZ1bmN0aW9uIChkZXApIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdFtkZXBdIHx8IG1pc3NpbmdbcHVzaF0oZGVwKTtcbiAgICAgICAgICAgICAgICB9KSAmJiBldmVyeShkZXBzLCBmdW5jdGlvbiAoZGVwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBsaXN0W2RlcF07XG4gICAgICAgICAgICAgICAgfSkgP1xuICAgICAgICAgICAgICAgICAgICByZWFkeSgpIDogISBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxheVtrZXldID0gZGVsYXlba2V5XSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGF5W2tleV1bcHVzaF0ocmVhZHkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVxICYmIHJlcShtaXNzaW5nKTtcbiAgICAgICAgICAgICAgICB9KGRlcHMuam9pbignfCcpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHNjcmlwdDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvKiBqc2hpbnQgK1cwMzAgKi9cbiAgICAgICAgICAgICRzY3JpcHQubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB3aW4uJHNjcmlwdCA9IG9sZDtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJldHVybiAkc2NyaXB0O1xuICAgICAgICB9KSgpO1xuXG4gICAgICAgIHZhciBtb2R1bGVzID0gW107XG4gICAgICAgIHZhciB2YWxpZEJhc2UgPSAvXihodHRwcz98ZmlsZSk6XFwvXFwvLztcbiAgICAgICAgZm9yICh2YXIgaSBpbiBtb2R1bGVNYXApIHtcbiAgICAgICAgICAgIGlmICh2YWxpZEJhc2UudGVzdChpKSlcbiAgICAgICAgICAgICAgICBtb2R1bGVzLnB1c2goaSk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbW9kdWxlcy5wdXNoKG1vZHVsZXNSZXBvc2l0b3J5ICsgJy8nICsgaS50b0xvd2VyQ2FzZSgpICsgJy0nICsgbW9kdWxlTWFwW2ldLnRvTG93ZXJDYXNlKCkgKyAnLmpzJyk7XG4gICAgICAgIH1cblxuICAgICAgICAkc2NyaXB0KG1vZHVsZXMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChvbmNvbXBsZXRlKSBvbmNvbXBsZXRlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cbn0pO1xuIiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG4vKipAXG4gKiAjQ3JhZnR5Lm1hdGhcbiAqIEBjYXRlZ29yeSAyRFxuICogU3RhdGljIGZ1bmN0aW9ucy5cbiAqL1xuQ3JhZnR5Lm1hdGggPSB7XG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkubWF0aC5hYnNcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5tYXRoLmFicyhOdW1iZXIgbilcbiAgICAgKiBAcGFyYW0gbiAtIFNvbWUgdmFsdWUuXG4gICAgICogQHJldHVybiBBYnNvbHV0ZSB2YWx1ZS5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIGFic29sdXRlIHZhbHVlLlxuICAgICAqL1xuICAgIGFiczogZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgcmV0dXJuIHggPCAwID8gLXggOiB4O1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLmFtb3VudE9mXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGhcbiAgICAgKiBAc2lnbiBwdWJsaWMgTnVtYmVyIENyYWZ0eS5tYXRoLmFtb3VudE9mKE51bWJlciBjaGVja1ZhbHVlLCBOdW1iZXIgbWluVmFsdWUsIE51bWJlciBtYXhWYWx1ZSlcbiAgICAgKiBAcGFyYW0gY2hlY2tWYWx1ZSAtIFZhbHVlIHRoYXQgc2hvdWxkIGNoZWNrZWQgd2l0aCBtaW5pbXVtIGFuZCBtYXhpbXVtLlxuICAgICAqIEBwYXJhbSBtaW5WYWx1ZSAtIE1pbmltdW0gdmFsdWUgdG8gY2hlY2suXG4gICAgICogQHBhcmFtIG1heFZhbHVlIC0gTWF4aW11bSB2YWx1ZSB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJuIEFtb3VudCBvZiBjaGVja1ZhbHVlIGNvbXBhcmVkIHRvIG1pblZhbHVlIGFuZCBtYXhWYWx1ZS5cbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIGFtb3VudCBvZiBob3cgbXVjaCBhIGNoZWNrVmFsdWUgaXMgbW9yZSBsaWtlIG1pblZhbHVlICg9MClcbiAgICAgKiBvciBtb3JlIGxpa2UgbWF4VmFsdWUgKD0xKVxuICAgICAqL1xuICAgIGFtb3VudE9mOiBmdW5jdGlvbiAoY2hlY2tWYWx1ZSwgbWluVmFsdWUsIG1heFZhbHVlKSB7XG4gICAgICAgIGlmIChtaW5WYWx1ZSA8IG1heFZhbHVlKVxuICAgICAgICAgICAgcmV0dXJuIChjaGVja1ZhbHVlIC0gbWluVmFsdWUpIC8gKG1heFZhbHVlIC0gbWluVmFsdWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gKGNoZWNrVmFsdWUgLSBtYXhWYWx1ZSkgLyAobWluVmFsdWUgLSBtYXhWYWx1ZSk7XG4gICAgfSxcblxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkubWF0aC5jbGFtcFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoXG4gICAgICogQHNpZ24gcHVibGljIE51bWJlciBDcmFmdHkubWF0aC5jbGFtcChOdW1iZXIgdmFsdWUsIE51bWJlciBtaW4sIE51bWJlciBtYXgpXG4gICAgICogQHBhcmFtIHZhbHVlIC0gQSB2YWx1ZS5cbiAgICAgKiBAcGFyYW0gbWF4IC0gTWF4aW11bSB0aGF0IHZhbHVlIGNhbiBiZS5cbiAgICAgKiBAcGFyYW0gbWluIC0gTWluaW11bSB0aGF0IHZhbHVlIGNhbiBiZS5cbiAgICAgKiBAcmV0dXJuIFRoZSB2YWx1ZSBiZXR3ZWVuIG1pbmltdW0gYW5kIG1heGltdW0uXG4gICAgICpcbiAgICAgKiBSZXN0cmljdHMgYSB2YWx1ZSB0byBiZSB3aXRoaW4gYSBzcGVjaWZpZWQgcmFuZ2UuXG4gICAgICovXG4gICAgY2xhbXA6IGZ1bmN0aW9uICh2YWx1ZSwgbWluLCBtYXgpIHtcbiAgICAgICAgaWYgKHZhbHVlID4gbWF4KVxuICAgICAgICAgICAgcmV0dXJuIG1heDtcbiAgICAgICAgZWxzZSBpZiAodmFsdWUgPCBtaW4pXG4gICAgICAgICAgICByZXR1cm4gbWluO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1hdGguZGVnVG9SYWRcbiAgICAgKiBDb252ZXJ0cyBhbmdsZSBmcm9tIGRlZ3JlZSB0byByYWRpYW4uXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGhcbiAgICAgKiBAcGFyYW0gYW5nbGVJbkRlZyAtIFRoZSBhbmdsZSBpbiBkZWdyZWUuXG4gICAgICogQHJldHVybiBUaGUgYW5nbGUgaW4gcmFkaWFuLlxuICAgICAqL1xuICAgIGRlZ1RvUmFkOiBmdW5jdGlvbiAoYW5nbGVJbkRlZykge1xuICAgICAgICByZXR1cm4gYW5nbGVJbkRlZyAqIE1hdGguUEkgLyAxODA7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1hdGguZGlzdGFuY2VcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgQ3JhZnR5Lm1hdGguZGlzdGFuY2UoTnVtYmVyIHgxLCBOdW1iZXIgeTEsIE51bWJlciB4MiwgTnVtYmVyIHkyKVxuICAgICAqIEBwYXJhbSB4MSAtIEZpcnN0IHggY29vcmRpbmF0ZS5cbiAgICAgKiBAcGFyYW0geTEgLSBGaXJzdCB5IGNvb3JkaW5hdGUuXG4gICAgICogQHBhcmFtIHgyIC0gU2Vjb25kIHggY29vcmRpbmF0ZS5cbiAgICAgKiBAcGFyYW0geTIgLSBTZWNvbmQgeSBjb29yZGluYXRlLlxuICAgICAqIEByZXR1cm4gVGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHR3byBwb2ludHMuXG4gICAgICpcbiAgICAgKiBEaXN0YW5jZSBiZXR3ZWVuIHR3byBwb2ludHMuXG4gICAgICovXG4gICAgZGlzdGFuY2U6IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgICAgICB2YXIgc3F1YXJlZERpc3RhbmNlID0gQ3JhZnR5Lm1hdGguc3F1YXJlZERpc3RhbmNlKHgxLCB5MSwgeDIsIHkyKTtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydChwYXJzZUZsb2F0KHNxdWFyZWREaXN0YW5jZSkpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLmxlcnBcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgQ3JhZnR5Lm1hdGgubGVycChOdW1iZXIgdmFsdWUxLCBOdW1iZXIgdmFsdWUyLCBOdW1iZXIgYW1vdW50KVxuICAgICAqIEBwYXJhbSB2YWx1ZTEgLSBPbmUgdmFsdWUuXG4gICAgICogQHBhcmFtIHZhbHVlMiAtIEFub3RoZXIgdmFsdWUuXG4gICAgICogQHBhcmFtIGFtb3VudCAtIEFtb3VudCBvZiB2YWx1ZTIgdG8gdmFsdWUxLlxuICAgICAqIEByZXR1cm4gTGluZWFyIGludGVycG9sYXRlZCB2YWx1ZS5cbiAgICAgKlxuICAgICAqIExpbmVhciBpbnRlcnBvbGF0aW9uLiBQYXNzaW5nIGFtb3VudCB3aXRoIGEgdmFsdWUgb2YgMCB3aWxsIGNhdXNlIHZhbHVlMSB0byBiZSByZXR1cm5lZCxcbiAgICAgKiBhIHZhbHVlIG9mIDEgd2lsbCBjYXVzZSB2YWx1ZTIgdG8gYmUgcmV0dXJuZWQuXG4gICAgICovXG4gICAgbGVycDogZnVuY3Rpb24gKHZhbHVlMSwgdmFsdWUyLCBhbW91bnQpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlMSArICh2YWx1ZTIgLSB2YWx1ZTEpICogYW1vdW50O1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLm5lZ2F0ZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoXG4gICAgICogQHNpZ24gcHVibGljIE51bWJlciBDcmFmdHkubWF0aC5uZWdhdGUoTnVtYmVyIHBlcmNlbnQpXG4gICAgICogQHBhcmFtIHBlcmNlbnQgLSBJZiB5b3UgcGFzcyAxIGEgLTEgd2lsbCBiZSByZXR1cm5lZC4gSWYgeW91IHBhc3MgMCBhIDEgd2lsbCBiZSByZXR1cm5lZC5cbiAgICAgKiBAcmV0dXJuIDEgb3IgLTEuXG4gICAgICpcbiAgICAgKiBSZXR1cm5lcyBcInJhbmRvbWx5XCIgLTEuXG4gICAgICovXG4gICAgbmVnYXRlOiBmdW5jdGlvbiAocGVyY2VudCkge1xuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IHBlcmNlbnQpXG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLnJhZFRvRGVnXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGhcbiAgICAgKiBAc2lnbiBwdWJsaWMgTnVtYmVyIENyYWZ0eS5tYXRoLnJhZFRvRGVnKE51bWJlciBhbmdsZSlcbiAgICAgKiBAcGFyYW0gYW5nbGVJblJhZCAtIFRoZSBhbmdsZSBpbiByYWRpYW4uXG4gICAgICogQHJldHVybiBUaGUgYW5nbGUgaW4gZGVncmVlLlxuICAgICAqXG4gICAgICogQ29udmVydHMgYW5nbGUgZnJvbSByYWRpYW4gdG8gZGVncmVlLlxuICAgICAqL1xuICAgIHJhZFRvRGVnOiBmdW5jdGlvbiAoYW5nbGVJblJhZCkge1xuICAgICAgICByZXR1cm4gYW5nbGVJblJhZCAqIDE4MCAvIE1hdGguUEk7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1hdGgucmFuZG9tRWxlbWVudE9mQXJyYXlcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyBPYmplY3QgQ3JhZnR5Lm1hdGgucmFuZG9tRWxlbWVudE9mQXJyYXkoQXJyYXkgYXJyYXkpXG4gICAgICogQHBhcmFtIGFycmF5IC0gQSBzcGVjaWZpYyBhcnJheS5cbiAgICAgKiBAcmV0dXJuIEEgcmFuZG9tIGVsZW1lbnQgb2YgYSBzcGVjaWZpYyBhcnJheS5cbiAgICAgKlxuICAgICAqIFJldHVybnMgYSByYW5kb20gZWxlbWVudCBvZiBhIHNwZWNpZmljIGFycmF5LlxuICAgICAqL1xuICAgIHJhbmRvbUVsZW1lbnRPZkFycmF5OiBmdW5jdGlvbiAoYXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5W01hdGguZmxvb3IoYXJyYXkubGVuZ3RoICogTWF0aC5yYW5kb20oKSldO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLnJhbmRvbUludFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoXG4gICAgICogQHNpZ24gcHVibGljIE51bWJlciBDcmFmdHkubWF0aC5yYW5kb21JbnQoTnVtYmVyIHN0YXJ0LCBOdW1iZXIgZW5kKVxuICAgICAqIEBwYXJhbSBzdGFydCAtIFNtYWxsZXN0IGludCB2YWx1ZSB0aGF0IGNhbiBiZSByZXR1cm5lZC5cbiAgICAgKiBAcGFyYW0gZW5kIC0gQmlnZ2VzdCBpbnQgdmFsdWUgdGhhdCBjYW4gYmUgcmV0dXJuZWQuXG4gICAgICogQHJldHVybiBBIHJhbmRvbSBpbnQuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIGEgcmFuZG9tIGludCBpbiB3aXRoaW4gYSBzcGVjaWZpYyByYW5nZS5cbiAgICAgKi9cbiAgICByYW5kb21JbnQ6IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gICAgICAgIHJldHVybiBzdGFydCArIE1hdGguZmxvb3IoKDEgKyBlbmQgLSBzdGFydCkgKiBNYXRoLnJhbmRvbSgpKTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkubWF0aC5yYW5kb21OdW1iZXJcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgQ3JhZnR5Lm1hdGgucmFuZG9tTnVtYmVyKE51bWJlciBzdGFydCwgTnVtYmVyIGVuZClcbiAgICAgKiBAcGFyYW0gc3RhcnQgLSBTbWFsbGVzdCBudW1iZXIgdmFsdWUgdGhhdCBjYW4gYmUgcmV0dXJuZWQuXG4gICAgICogQHBhcmFtIGVuZCAtIEJpZ2dlc3QgbnVtYmVyIHZhbHVlIHRoYXQgY2FuIGJlIHJldHVybmVkLlxuICAgICAqIEByZXR1cm4gQSByYW5kb20gbnVtYmVyLlxuICAgICAqXG4gICAgICogUmV0dXJucyBhIHJhbmRvbSBudW1iZXIgaW4gd2l0aGluIGEgc3BlY2lmaWMgcmFuZ2UuXG4gICAgICovXG4gICAgcmFuZG9tTnVtYmVyOiBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICAgICAgICByZXR1cm4gc3RhcnQgKyAoZW5kIC0gc3RhcnQpICogTWF0aC5yYW5kb20oKTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkubWF0aC5zcXVhcmVkRGlzdGFuY2VcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aFxuICAgICAqIEBzaWduIHB1YmxpYyBOdW1iZXIgQ3JhZnR5Lm1hdGguc3F1YXJlZERpc3RhbmNlKE51bWJlciB4MSwgTnVtYmVyIHkxLCBOdW1iZXIgeDIsIE51bWJlciB5MilcbiAgICAgKiBAcGFyYW0geDEgLSBGaXJzdCB4IGNvb3JkaW5hdGUuXG4gICAgICogQHBhcmFtIHkxIC0gRmlyc3QgeSBjb29yZGluYXRlLlxuICAgICAqIEBwYXJhbSB4MiAtIFNlY29uZCB4IGNvb3JkaW5hdGUuXG4gICAgICogQHBhcmFtIHkyIC0gU2Vjb25kIHkgY29vcmRpbmF0ZS5cbiAgICAgKiBAcmV0dXJuIFRoZSBzcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gdGhlIHR3byBwb2ludHMuXG4gICAgICpcbiAgICAgKiBTcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gdHdvIHBvaW50cy5cbiAgICAgKi9cbiAgICBzcXVhcmVkRGlzdGFuY2U6IGZ1bmN0aW9uICh4MSwgeTEsIHgyLCB5Mikge1xuICAgICAgICByZXR1cm4gKHgxIC0geDIpICogKHgxIC0geDIpICsgKHkxIC0geTIpICogKHkxIC0geTIpO1xuICAgIH0sXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLndpdGhpblJhbmdlXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGhcbiAgICAgKiBAc2lnbiBwdWJsaWMgQm9vbGVhbiBDcmFmdHkubWF0aC53aXRoaW5SYW5nZShOdW1iZXIgdmFsdWUsIE51bWJlciBtaW4sIE51bWJlciBtYXgpXG4gICAgICogQHBhcmFtIHZhbHVlIC0gVGhlIHNwZWNpZmljIHZhbHVlLlxuICAgICAqIEBwYXJhbSBtaW4gLSBNaW5pbXVtIHZhbHVlLlxuICAgICAqIEBwYXJhbSBtYXggLSBNYXhpbXVtIHZhbHVlLlxuICAgICAqIEByZXR1cm4gUmV0dXJucyB0cnVlIGlmIHZhbHVlIGlzIHdpdGhpbiBhIHNwZWNpZmljIHJhbmdlLlxuICAgICAqXG4gICAgICogQ2hlY2sgaWYgYSB2YWx1ZSBpcyB3aXRoaW4gYSBzcGVjaWZpYyByYW5nZS5cbiAgICAgKi9cbiAgICB3aXRoaW5SYW5nZTogZnVuY3Rpb24gKHZhbHVlLCBtaW4sIG1heCkge1xuICAgICAgICByZXR1cm4gKHZhbHVlID49IG1pbiAmJiB2YWx1ZSA8PSBtYXgpO1xuICAgIH1cbn07XG5cbkNyYWZ0eS5tYXRoLlZlY3RvcjJEID0gKGZ1bmN0aW9uICgpIHtcbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICogQGNhdGVnb3J5IDJEXG4gICAgICogQGNsYXNzIFRoaXMgaXMgYSBnZW5lcmFsIHB1cnBvc2UgMkQgdmVjdG9yIGNsYXNzXG4gICAgICpcbiAgICAgKiBWZWN0b3IyRCB1c2VzIHRoZSBmb2xsb3dpbmcgZm9ybTpcbiAgICAgKiA8eCwgeT5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBWZWN0b3IyRCgpO1xuICAgICAqIEBzaWduIHB1YmxpYyB7VmVjdG9yMkR9IFZlY3RvcjJEKFZlY3RvcjJEKTtcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBWZWN0b3IyRChOdW1iZXIsIE51bWJlcik7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRHxOdW1iZXI9MH0geFxuICAgICAqIEBwYXJhbSB7TnVtYmVyPTB9IHlcbiAgICAgKi9cblxuICAgIGZ1bmN0aW9uIFZlY3RvcjJEKHgsIHkpIHtcbiAgICAgICAgaWYgKHggaW5zdGFuY2VvZiBWZWN0b3IyRCkge1xuICAgICAgICAgICAgdGhpcy54ID0geC54O1xuICAgICAgICAgICAgdGhpcy55ID0geC55O1xuICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIHRoaXMueCA9IHg7XG4gICAgICAgICAgICB0aGlzLnkgPSB5O1xuICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgdGhyb3cgXCJVbmV4cGVjdGVkIG51bWJlciBvZiBhcmd1bWVudHMgZm9yIFZlY3RvcjJEKClcIjtcbiAgICB9IC8vIGNsYXNzIFZlY3RvcjJEXG5cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUueCA9IDA7XG4gICAgVmVjdG9yMkQucHJvdG90eXBlLnkgPSAwO1xuXG4gICAgLyoqQFxuICAgICAqICMuYWRkXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIEFkZHMgdGhlIHBhc3NlZCB2ZWN0b3IgdG8gdGhpcyB2ZWN0b3JcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBhZGQoVmVjdG9yMkQpO1xuICAgICAqIEBwYXJhbSB7dmVjdG9yMkR9IHZlY1JIXG4gICAgICogQHJldHVybnMge1ZlY3RvcjJEfSB0aGlzIGFmdGVyIGFkZGluZ1xuICAgICAqL1xuICAgIFZlY3RvcjJELnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbiAodmVjUkgpIHtcbiAgICAgICAgdGhpcy54ICs9IHZlY1JILng7XG4gICAgICAgIHRoaXMueSArPSB2ZWNSSC55O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9OyAvLyBhZGRcblxuICAgIC8qKkBcbiAgICAgKiAjLmFuZ2xlQmV0d2VlblxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBhbmdsZSBiZXR3ZWVuIHRoZSBwYXNzZWQgdmVjdG9yIGFuZCB0aGlzIHZlY3RvciwgdXNpbmcgPDAsMD4gYXMgdGhlIHBvaW50IG9mIHJlZmVyZW5jZS5cbiAgICAgKiBBbmdsZXMgcmV0dXJuZWQgaGF2ZSB0aGUgcmFuZ2UgKOKIks+ALCDPgF0uXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtOdW1iZXJ9IGFuZ2xlQmV0d2VlbihWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aGUgYW5nbGUgYmV0d2VlbiB0aGUgdHdvIHZlY3RvcnMgaW4gcmFkaWFuc1xuICAgICAqL1xuICAgIFZlY3RvcjJELnByb3RvdHlwZS5hbmdsZUJldHdlZW4gPSBmdW5jdGlvbiAodmVjUkgpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguYXRhbjIodGhpcy54ICogdmVjUkgueSAtIHRoaXMueSAqIHZlY1JILngsIHRoaXMueCAqIHZlY1JILnggKyB0aGlzLnkgKiB2ZWNSSC55KTtcbiAgICB9OyAvLyBhbmdsZUJldHdlZW5cblxuICAgIC8qKkBcbiAgICAgKiAjLmFuZ2xlVG9cbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5WZWN0b3IyRFxuICAgICAqXG4gICAgICogQ2FsY3VsYXRlcyB0aGUgYW5nbGUgdG8gdGhlIHBhc3NlZCB2ZWN0b3IgZnJvbSB0aGlzIHZlY3RvciwgdXNpbmcgdGhpcyB2ZWN0b3IgYXMgdGhlIHBvaW50IG9mIHJlZmVyZW5jZS5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge051bWJlcn0gYW5nbGVUbyhWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aGUgYW5nbGUgdG8gdGhlIHBhc3NlZCB2ZWN0b3IgaW4gcmFkaWFuc1xuICAgICAqL1xuICAgIFZlY3RvcjJELnByb3RvdHlwZS5hbmdsZVRvID0gZnVuY3Rpb24gKHZlY1JIKSB7XG4gICAgICAgIHJldHVybiBNYXRoLmF0YW4yKHZlY1JILnkgLSB0aGlzLnksIHZlY1JILnggLSB0aGlzLngpO1xuICAgIH07XG5cbiAgICAvKipAXG4gICAgICogIy5jbG9uZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDcmVhdGVzIGFuZCBleGFjdCwgbnVtZXJpYyBjb3B5IG9mIHRoaXMgdmVjdG9yXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtWZWN0b3IyRH0gY2xvbmUoKTtcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoZSBuZXcgdmVjdG9yXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IFZlY3RvcjJEKHRoaXMpO1xuICAgIH07IC8vIGNsb25lXG5cbiAgICAvKipAXG4gICAgICogIy5kaXN0YW5jZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBkaXN0YW5jZSBmcm9tIHRoaXMgdmVjdG9yIHRvIHRoZSBwYXNzZWQgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7TnVtYmVyfSBkaXN0YW5jZShWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgdHdvIHZlY3RvcnNcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUuZGlzdGFuY2UgPSBmdW5jdGlvbiAodmVjUkgpIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCgodmVjUkgueCAtIHRoaXMueCkgKiAodmVjUkgueCAtIHRoaXMueCkgKyAodmVjUkgueSAtIHRoaXMueSkgKiAodmVjUkgueSAtIHRoaXMueSkpO1xuICAgIH07IC8vIGRpc3RhbmNlXG5cbiAgICAvKipAXG4gICAgICogIy5kaXN0YW5jZVNxXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgZGlzdGFuY2UgZnJvbSB0aGlzIHZlY3RvciB0byB0aGUgcGFzc2VkIHZlY3Rvci5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGF2b2lkcyBjYWxjdWxhdGluZyB0aGUgc3F1YXJlIHJvb3QsIHRodXMgYmVpbmcgc2xpZ2h0bHkgZmFzdGVyIHRoYW4gLmRpc3RhbmNlKCApLlxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7TnVtYmVyfSBkaXN0YW5jZVNxKFZlY3RvcjJEKTtcbiAgICAgKiBAcGFyYW0ge1ZlY3RvcjJEfSB2ZWNSSFxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRoZSBzcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gdGhlIHR3byB2ZWN0b3JzXG4gICAgICogQHNlZSAuZGlzdGFuY2VcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUuZGlzdGFuY2VTcSA9IGZ1bmN0aW9uICh2ZWNSSCkge1xuICAgICAgICByZXR1cm4gKHZlY1JILnggLSB0aGlzLngpICogKHZlY1JILnggLSB0aGlzLngpICsgKHZlY1JILnkgLSB0aGlzLnkpICogKHZlY1JILnkgLSB0aGlzLnkpO1xuICAgIH07IC8vIGRpc3RhbmNlU3FcblxuICAgIC8qKkBcbiAgICAgKiAjLmRpdmlkZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBEaXZpZGVzIHRoaXMgdmVjdG9yIGJ5IHRoZSBwYXNzZWQgdmVjdG9yLlxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7VmVjdG9yMkR9IGRpdmlkZShWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIGRpdmlkaW5nXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLmRpdmlkZSA9IGZ1bmN0aW9uICh2ZWNSSCkge1xuICAgICAgICB0aGlzLnggLz0gdmVjUkgueDtcbiAgICAgICAgdGhpcy55IC89IHZlY1JILnk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07IC8vIGRpdmlkZVxuXG4gICAgLyoqQFxuICAgICAqICMuZG90UHJvZHVjdFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBkb3QgcHJvZHVjdCBvZiB0aGlzIGFuZCB0aGUgcGFzc2VkIHZlY3RvcnNcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge051bWJlcn0gZG90UHJvZHVjdChWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aGUgcmVzdWx0YW50IGRvdCBwcm9kdWN0XG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLmRvdFByb2R1Y3QgPSBmdW5jdGlvbiAodmVjUkgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueCAqIHZlY1JILnggKyB0aGlzLnkgKiB2ZWNSSC55O1xuICAgIH07IC8vIGRvdFByb2R1Y3RcblxuICAgIC8qKkBcbiAgICAgKiAjLmVxdWFsc1xuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoaXMgdmVjdG9yIGlzIG51bWVyaWNhbGx5IGVxdWl2YWxlbnQgdG8gdGhlIHBhc3NlZCB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtCb29sZWFufSBlcXVhbHMoVmVjdG9yMkQpO1xuICAgICAqIEBwYXJhbSB7VmVjdG9yMkR9IHZlY1JIXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgdGhlIHZlY3RvcnMgYXJlIGVxdWl2YWxlbnRcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKHZlY1JIKSB7XG4gICAgICAgIHJldHVybiB2ZWNSSCBpbnN0YW5jZW9mIFZlY3RvcjJEICYmXG4gICAgICAgICAgICB0aGlzLnggPT0gdmVjUkgueCAmJiB0aGlzLnkgPT0gdmVjUkgueTtcbiAgICB9OyAvLyBlcXVhbHNcblxuICAgIC8qKkBcbiAgICAgKiAjLmdldE5vcm1hbFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIGEgbmV3IHJpZ2h0LWhhbmRlZCBub3JtYWwgdmVjdG9yIGZvciB0aGUgbGluZSBjcmVhdGVkIGJ5IHRoaXMgYW5kIHRoZSBwYXNzZWQgdmVjdG9ycy5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBnZXROb3JtYWwoW1ZlY3RvcjJEXSk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRD08MCwwPn0gW3ZlY1JIXVxuICAgICAqIEByZXR1cm5zIHtWZWN0b3IyRH0gdGhlIG5ldyBub3JtYWwgdmVjdG9yXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLmdldE5vcm1hbCA9IGZ1bmN0aW9uICh2ZWNSSCkge1xuICAgICAgICBpZiAodmVjUkggPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHJldHVybiBuZXcgVmVjdG9yMkQoLXRoaXMueSwgdGhpcy54KTsgLy8gYXNzdW1lIHZlY1JIIGlzIDwwLCAwPlxuICAgICAgICByZXR1cm4gbmV3IFZlY3RvcjJEKHZlY1JILnkgLSB0aGlzLnksIHRoaXMueCAtIHZlY1JILngpLm5vcm1hbGl6ZSgpO1xuICAgIH07IC8vIGdldE5vcm1hbFxuXG4gICAgLyoqQFxuICAgICAqICMuaXNaZXJvXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIERldGVybWluZXMgaWYgdGhpcyB2ZWN0b3IgaXMgZXF1YWwgdG8gPDAsMD5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge0Jvb2xlYW59IGlzWmVybygpO1xuICAgICAqIEByZXR1cm5zIHtCb29sZWFufSB0cnVlIGlmIHRoaXMgdmVjdG9yIGlzIGVxdWFsIHRvIDwwLDA+XG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLmlzWmVybyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueCA9PT0gMCAmJiB0aGlzLnkgPT09IDA7XG4gICAgfTsgLy8gaXNaZXJvXG5cbiAgICAvKipAXG4gICAgICogIy5tYWduaXR1ZGVcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5WZWN0b3IyRFxuICAgICAqXG4gICAgICogQ2FsY3VsYXRlcyB0aGUgbWFnbml0dWRlIG9mIHRoaXMgdmVjdG9yLlxuICAgICAqIE5vdGU6IEZ1bmN0aW9uIG9iamVjdHMgaW4gSmF2YVNjcmlwdCBhbHJlYWR5IGhhdmUgYSAnbGVuZ3RoJyBtZW1iZXIsIGhlbmNlIHRoZSB1c2Ugb2YgbWFnbml0dWRlIGluc3RlYWQuXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtOdW1iZXJ9IG1hZ25pdHVkZSgpO1xuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRoZSBtYWduaXR1ZGUgb2YgdGhpcyB2ZWN0b3JcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUubWFnbml0dWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSk7XG4gICAgfTsgLy8gbWFnbml0dWRlXG5cbiAgICAvKipAXG4gICAgICogIy5tYWduaXR1ZGVTcVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmUgb2YgdGhlIG1hZ25pdHVkZSBvZiB0aGlzIHZlY3Rvci5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGF2b2lkcyBjYWxjdWxhdGluZyB0aGUgc3F1YXJlIHJvb3QsIHRodXMgYmVpbmcgc2xpZ2h0bHkgZmFzdGVyIHRoYW4gLm1hZ25pdHVkZSggKS5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge051bWJlcn0gbWFnbml0dWRlU3EoKTtcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aGUgc3F1YXJlIG9mIHRoZSBtYWduaXR1ZGUgb2YgdGhpcyB2ZWN0b3JcbiAgICAgKiBAc2VlIC5tYWduaXR1ZGVcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUubWFnbml0dWRlU3EgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnk7XG4gICAgfTsgLy8gbWFnbml0dWRlU3FcblxuICAgIC8qKkBcbiAgICAgKiAjLm11bHRpcGx5XG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIE11bHRpcGxpZXMgdGhpcyB2ZWN0b3IgYnkgdGhlIHBhc3NlZCB2ZWN0b3JcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBtdWx0aXBseShWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIG11bHRpcGx5aW5nXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLm11bHRpcGx5ID0gZnVuY3Rpb24gKHZlY1JIKSB7XG4gICAgICAgIHRoaXMueCAqPSB2ZWNSSC54O1xuICAgICAgICB0aGlzLnkgKj0gdmVjUkgueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gbXVsdGlwbHlcblxuICAgIC8qKkBcbiAgICAgKiAjLm5lZ2F0ZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBOZWdhdGVzIHRoaXMgdmVjdG9yIChpZS4gPC14LC15PilcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBuZWdhdGUoKTtcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIG5lZ2F0aW9uXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLm5lZ2F0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy54ID0gLXRoaXMueDtcbiAgICAgICAgdGhpcy55ID0gLXRoaXMueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gbmVnYXRlXG5cbiAgICAvKipAXG4gICAgICogIy5ub3JtYWxpemVcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5WZWN0b3IyRFxuICAgICAqXG4gICAgICogTm9ybWFsaXplcyB0aGlzIHZlY3RvciAoc2NhbGVzIHRoZSB2ZWN0b3Igc28gdGhhdCBpdHMgbmV3IG1hZ25pdHVkZSBpcyAxKVxuICAgICAqIEZvciB2ZWN0b3JzIHdoZXJlIG1hZ25pdHVkZSBpcyAwLCA8MSwwPiBpcyByZXR1cm5lZC5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBub3JtYWxpemUoKTtcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIG5vcm1hbGl6YXRpb25cbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUubm9ybWFsaXplID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbG5nID0gTWF0aC5zcXJ0KHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueSk7XG5cbiAgICAgICAgaWYgKGxuZyA9PT0gMCkge1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBkdWUgRWFzdFxuICAgICAgICAgICAgdGhpcy54ID0gMTtcbiAgICAgICAgICAgIHRoaXMueSA9IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnggLz0gbG5nO1xuICAgICAgICAgICAgdGhpcy55IC89IGxuZztcbiAgICAgICAgfSAvLyBlbHNlXG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gbm9ybWFsaXplXG5cbiAgICAvKipAXG4gICAgICogIy5zY2FsZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBTY2FsZXMgdGhpcyB2ZWN0b3IgYnkgdGhlIHBhc3NlZCBhbW91bnQocylcbiAgICAgKiBJZiBzY2FsYXJZIGlzIG9taXR0ZWQsIHNjYWxhclggaXMgdXNlZCBmb3IgYm90aCBheGVzXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtWZWN0b3IyRH0gc2NhbGUoTnVtYmVyWywgTnVtYmVyXSk7XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjYWxhclhcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gW3NjYWxhclldXG4gICAgICogQHJldHVybnMge1ZlY3RvcjJEfSB0aGlzIGFmdGVyIHNjYWxpbmdcbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUuc2NhbGUgPSBmdW5jdGlvbiAoc2NhbGFyWCwgc2NhbGFyWSkge1xuICAgICAgICBpZiAoc2NhbGFyWSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgc2NhbGFyWSA9IHNjYWxhclg7XG5cbiAgICAgICAgdGhpcy54ICo9IHNjYWxhclg7XG4gICAgICAgIHRoaXMueSAqPSBzY2FsYXJZO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07IC8vIHNjYWxlXG5cbiAgICAvKipAXG4gICAgICogIy5zY2FsZVRvTWFnbml0dWRlXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIFNjYWxlcyB0aGlzIHZlY3RvciBzdWNoIHRoYXQgaXRzIG5ldyBtYWduaXR1ZGUgaXMgZXF1YWwgdG8gdGhlIHBhc3NlZCB2YWx1ZS5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBzY2FsZVRvTWFnbml0dWRlKE51bWJlcik7XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG1hZ1xuICAgICAqIEByZXR1cm5zIHtWZWN0b3IyRH0gdGhpcyB2ZWN0b3IgYWZ0ZXIgc2NhbGluZ1xuICAgICAqL1xuICAgIFZlY3RvcjJELnByb3RvdHlwZS5zY2FsZVRvTWFnbml0dWRlID0gZnVuY3Rpb24gKG1hZykge1xuICAgICAgICB2YXIgayA9IG1hZyAvIHRoaXMubWFnbml0dWRlKCk7XG4gICAgICAgIHRoaXMueCAqPSBrO1xuICAgICAgICB0aGlzLnkgKj0gaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gc2NhbGVUb01hZ25pdHVkZVxuXG4gICAgLyoqQFxuICAgICAqICMuc2V0VmFsdWVzXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIFNldHMgdGhlIHZhbHVlcyBvZiB0aGlzIHZlY3RvciB1c2luZyBhIHBhc3NlZCB2ZWN0b3Igb3IgcGFpciBvZiBudW1iZXJzLlxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7VmVjdG9yMkR9IHNldFZhbHVlcyhWZWN0b3IyRCk7XG4gICAgICogQHNpZ24gcHVibGljIHtWZWN0b3IyRH0gc2V0VmFsdWVzKE51bWJlciwgTnVtYmVyKTtcbiAgICAgKiBAcGFyYW0ge051bWJlcnxWZWN0b3IyRH0geFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB5XG4gICAgICogQHJldHVybnMge1ZlY3RvcjJEfSB0aGlzIHZlY3RvciBhZnRlciBzZXR0aW5nIG9mIHZhbHVlc1xuICAgICAqL1xuICAgIFZlY3RvcjJELnByb3RvdHlwZS5zZXRWYWx1ZXMgPSBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICBpZiAoeCBpbnN0YW5jZW9mIFZlY3RvcjJEKSB7XG4gICAgICAgICAgICB0aGlzLnggPSB4Lng7XG4gICAgICAgICAgICB0aGlzLnkgPSB4Lnk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICAgICAgdGhpcy55ID0geTtcbiAgICAgICAgfSAvLyBlbHNlXG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gc2V0VmFsdWVzXG5cbiAgICAvKipAXG4gICAgICogIy5zdWJ0cmFjdFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBTdWJ0cmFjdHMgdGhlIHBhc3NlZCB2ZWN0b3IgZnJvbSB0aGlzIHZlY3Rvci5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBzdWJ0cmFjdChWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkhcbiAgICAgKiBAcmV0dXJucyB7dmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIHN1YnRyYWN0aW5nXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24gKHZlY1JIKSB7XG4gICAgICAgIHRoaXMueCAtPSB2ZWNSSC54O1xuICAgICAgICB0aGlzLnkgLT0gdmVjUkgueTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gc3VidHJhY3RcblxuICAgIC8qKkBcbiAgICAgKiAjLnRvU3RyaW5nXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguVmVjdG9yMkRcbiAgICAgKlxuICAgICAqIFJldHVybnMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhpcyB2ZWN0b3IuXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtTdHJpbmd9IHRvU3RyaW5nKCk7XG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKi9cbiAgICBWZWN0b3IyRC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBcIlZlY3RvcjJEKFwiICsgdGhpcy54ICsgXCIsIFwiICsgdGhpcy55ICsgXCIpXCI7XG4gICAgfTsgLy8gdG9TdHJpbmdcblxuICAgIC8qKkBcbiAgICAgKiAjLnRyYW5zbGF0ZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBUcmFuc2xhdGVzIChtb3ZlcykgdGhpcyB2ZWN0b3IgYnkgdGhlIHBhc3NlZCBhbW91bnRzLlxuICAgICAqIElmIGR5IGlzIG9taXR0ZWQsIGR4IGlzIHVzZWQgZm9yIGJvdGggYXhlcy5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSB0cmFuc2xhdGUoTnVtYmVyWywgTnVtYmVyXSk7XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGR4XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtkeV1cbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoaXMgdmVjdG9yIGFmdGVyIHRyYW5zbGF0aW5nXG4gICAgICovXG4gICAgVmVjdG9yMkQucHJvdG90eXBlLnRyYW5zbGF0ZSA9IGZ1bmN0aW9uIChkeCwgZHkpIHtcbiAgICAgICAgaWYgKGR5ID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBkeSA9IGR4O1xuXG4gICAgICAgIHRoaXMueCArPSBkeDtcbiAgICAgICAgdGhpcy55ICs9IGR5O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07IC8vIHRyYW5zbGF0ZVxuXG4gICAgLyoqQFxuICAgICAqICMudHJpcGxlUHJvZHVjdFxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLlZlY3RvcjJEXG4gICAgICpcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSB0cmlwbGUgcHJvZHVjdCBvZiB0aHJlZSB2ZWN0b3JzLlxuICAgICAqIHRyaXBsZSB2ZWN0b3IgcHJvZHVjdCA9IGIoYeKAomMpIC0gYShi4oCiYylcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHNpZ24gcHVibGljIHtWZWN0b3IyRH0gdHJpcGxlUHJvZHVjdChWZWN0b3IyRCwgVmVjdG9yMkQsIFZlY3RvcjJEKTtcbiAgICAgKiBAcGFyYW0ge1ZlY3RvcjJEfSBhXG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gYlxuICAgICAqIEBwYXJhbSB7VmVjdG9yMkR9IGNcbiAgICAgKiBAcmV0dXJuIHtWZWN0b3IyRH0gdGhlIHRyaXBsZSBwcm9kdWN0IGFzIGEgbmV3IHZlY3RvclxuICAgICAqL1xuICAgIFZlY3RvcjJELnRyaXBsZVByb2R1Y3QgPSBmdW5jdGlvbiAoYSwgYiwgYykge1xuICAgICAgICB2YXIgYWMgPSBhLmRvdFByb2R1Y3QoYyk7XG4gICAgICAgIHZhciBiYyA9IGIuZG90UHJvZHVjdChjKTtcbiAgICAgICAgcmV0dXJuIG5ldyBDcmFmdHkubWF0aC5WZWN0b3IyRChiLnggKiBhYyAtIGEueCAqIGJjLCBiLnkgKiBhYyAtIGEueSAqIGJjKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIFZlY3RvcjJEO1xufSkoKTtcblxuQ3JhZnR5Lm1hdGguTWF0cml4MkQgPSAoZnVuY3Rpb24gKCkge1xuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKiBAY2F0ZWdvcnkgMkRcbiAgICAgKlxuICAgICAqIEBjbGFzcyBUaGlzIGlzIGEgMkQgTWF0cml4MkQgY2xhc3MuIEl0IGlzIDN4MyB0byBhbGxvdyBmb3IgYWZmaW5lIHRyYW5zZm9ybWF0aW9ucyBpbiAyRCBzcGFjZS5cbiAgICAgKiBUaGUgdGhpcmQgcm93IGlzIGFsd2F5cyBhc3N1bWVkIHRvIGJlIFswLCAwLCAxXS5cbiAgICAgKlxuICAgICAqIE1hdHJpeDJEIHVzZXMgdGhlIGZvbGxvd2luZyBmb3JtLCBhcyBwZXIgdGhlIHdoYXR3Zy5vcmcgc3BlY2lmaWNhdGlvbnMgZm9yIGNhbnZhcy50cmFuc2Zvcm0oKTpcbiAgICAgKiBbYSwgYywgZV1cbiAgICAgKiBbYiwgZCwgZl1cbiAgICAgKiBbMCwgMCwgMV1cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSBuZXcgTWF0cml4MkQoKTtcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSBuZXcgTWF0cml4MkQoTWF0cml4MkQpO1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IG5ldyBNYXRyaXgyRChOdW1iZXIsIE51bWJlciwgTnVtYmVyLCBOdW1iZXIsIE51bWJlciwgTnVtYmVyKTtcbiAgICAgKiBAcGFyYW0ge01hdHJpeDJEfE51bWJlcj0xfSBhXG4gICAgICogQHBhcmFtIHtOdW1iZXI9MH0gYlxuICAgICAqIEBwYXJhbSB7TnVtYmVyPTB9IGNcbiAgICAgKiBAcGFyYW0ge051bWJlcj0xfSBkXG4gICAgICogQHBhcmFtIHtOdW1iZXI9MH0gZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyPTB9IGZcbiAgICAgKi9cbiAgICBNYXRyaXgyRCA9IGZ1bmN0aW9uIChhLCBiLCBjLCBkLCBlLCBmKSB7XG4gICAgICAgIGlmIChhIGluc3RhbmNlb2YgTWF0cml4MkQpIHtcbiAgICAgICAgICAgIHRoaXMuYSA9IGEuYTtcbiAgICAgICAgICAgIHRoaXMuYiA9IGEuYjtcbiAgICAgICAgICAgIHRoaXMuYyA9IGEuYztcbiAgICAgICAgICAgIHRoaXMuZCA9IGEuZDtcbiAgICAgICAgICAgIHRoaXMuZSA9IGEuZTtcbiAgICAgICAgICAgIHRoaXMuZiA9IGEuZjtcbiAgICAgICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSA2KSB7XG4gICAgICAgICAgICB0aGlzLmEgPSBhO1xuICAgICAgICAgICAgdGhpcy5iID0gYjtcbiAgICAgICAgICAgIHRoaXMuYyA9IGM7XG4gICAgICAgICAgICB0aGlzLmQgPSBkO1xuICAgICAgICAgICAgdGhpcy5lID0gZTtcbiAgICAgICAgICAgIHRoaXMuZiA9IGY7XG4gICAgICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB0aHJvdyBcIlVuZXhwZWN0ZWQgbnVtYmVyIG9mIGFyZ3VtZW50cyBmb3IgTWF0cml4MkQoKVwiO1xuICAgIH07IC8vIGNsYXNzIE1hdHJpeDJEXG5cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuYSA9IDE7XG4gICAgTWF0cml4MkQucHJvdG90eXBlLmIgPSAwO1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS5jID0gMDtcbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuZCA9IDE7XG4gICAgTWF0cml4MkQucHJvdG90eXBlLmUgPSAwO1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS5mID0gMDtcblxuICAgIC8qKkBcbiAgICAgKiAjLmFwcGx5XG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIEFwcGxpZXMgdGhlIG1hdHJpeCB0cmFuc2Zvcm1hdGlvbnMgdG8gdGhlIHBhc3NlZCBvYmplY3RcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1ZlY3RvcjJEfSBhcHBseShWZWN0b3IyRCk7XG4gICAgICogQHBhcmFtIHtWZWN0b3IyRH0gdmVjUkggLSB2ZWN0b3IgdG8gYmUgdHJhbnNmb3JtZWRcbiAgICAgKiBAcmV0dXJucyB7VmVjdG9yMkR9IHRoZSBwYXNzZWQgdmVjdG9yIG9iamVjdCBhZnRlciB0cmFuc2Zvcm1pbmdcbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuYXBwbHkgPSBmdW5jdGlvbiAodmVjUkgpIHtcbiAgICAgICAgLy8gSSdtIG5vdCBzdXJlIG9mIHRoZSBiZXN0IHdheSBmb3IgdGhpcyBmdW5jdGlvbiB0byBiZSBpbXBsZW1lbnRlZC4gSWRlYWxseVxuICAgICAgICAvLyBzdXBwb3J0IGZvciBvdGhlciBvYmplY3RzIChyZWN0YW5nbGVzLCBwb2x5Z29ucywgZXRjKSBzaG91bGQgYmUgZWFzaWx5XG4gICAgICAgIC8vIGFkZGFibGUgaW4gdGhlIGZ1dHVyZS4gTWF5YmUgYSBmdW5jdGlvbiAoYXBwbHkpIGlzIG5vdCB0aGUgYmVzdCB3YXkgdG8gZG9cbiAgICAgICAgLy8gdGhpcy4uLj9cblxuICAgICAgICB2YXIgdG1wWCA9IHZlY1JILng7XG4gICAgICAgIHZlY1JILnggPSB0bXBYICogdGhpcy5hICsgdmVjUkgueSAqIHRoaXMuYyArIHRoaXMuZTtcbiAgICAgICAgdmVjUkgueSA9IHRtcFggKiB0aGlzLmIgKyB2ZWNSSC55ICogdGhpcy5kICsgdGhpcy5mO1xuICAgICAgICAvLyBubyBuZWVkIHRvIGhvbW9nZW5pemUgc2luY2UgdGhlIHRoaXJkIHJvdyBpcyBhbHdheXMgWzAsIDAsIDFdXG5cbiAgICAgICAgcmV0dXJuIHZlY1JIO1xuICAgIH07IC8vIGFwcGx5XG5cbiAgICAvKipAXG4gICAgICogIy5jbG9uZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLk1hdHJpeDJEXG4gICAgICpcbiAgICAgKiBDcmVhdGVzIGFuIGV4YWN0LCBudW1lcmljIGNvcHkgb2YgdGhlIGN1cnJlbnQgbWF0cml4XG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtNYXRyaXgyRH0gY2xvbmUoKTtcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4MkR9XG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IE1hdHJpeDJEKHRoaXMpO1xuICAgIH07IC8vIGNsb25lXG5cbiAgICAvKipAXG4gICAgICogIy5jb21iaW5lXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIE11bHRpcGxpZXMgdGhpcyBtYXRyaXggd2l0aCBhbm90aGVyLCBvdmVycmlkaW5nIHRoZSB2YWx1ZXMgb2YgdGhpcyBtYXRyaXguXG4gICAgICogVGhlIHBhc3NlZCBtYXRyaXggaXMgYXNzdW1lZCB0byBiZSBvbiB0aGUgcmlnaHQtaGFuZCBzaWRlLlxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IGNvbWJpbmUoTWF0cml4MkQpO1xuICAgICAqIEBwYXJhbSB7TWF0cml4MkR9IG10cnhSSFxuICAgICAqIEByZXR1cm5zIHtNYXRyaXgyRH0gdGhpcyBtYXRyaXggYWZ0ZXIgY29tYmluYXRpb25cbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuY29tYmluZSA9IGZ1bmN0aW9uIChtdHJ4UkgpIHtcbiAgICAgICAgdmFyIHRtcCA9IHRoaXMuYTtcbiAgICAgICAgdGhpcy5hID0gdG1wICogbXRyeFJILmEgKyB0aGlzLmIgKiBtdHJ4UkguYztcbiAgICAgICAgdGhpcy5iID0gdG1wICogbXRyeFJILmIgKyB0aGlzLmIgKiBtdHJ4UkguZDtcbiAgICAgICAgdG1wID0gdGhpcy5jO1xuICAgICAgICB0aGlzLmMgPSB0bXAgKiBtdHJ4UkguYSArIHRoaXMuZCAqIG10cnhSSC5jO1xuICAgICAgICB0aGlzLmQgPSB0bXAgKiBtdHJ4UkguYiArIHRoaXMuZCAqIG10cnhSSC5kO1xuICAgICAgICB0bXAgPSB0aGlzLmU7XG4gICAgICAgIHRoaXMuZSA9IHRtcCAqIG10cnhSSC5hICsgdGhpcy5mICogbXRyeFJILmMgKyBtdHJ4UkguZTtcbiAgICAgICAgdGhpcy5mID0gdG1wICogbXRyeFJILmIgKyB0aGlzLmYgKiBtdHJ4UkguZCArIG10cnhSSC5mO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9OyAvLyBjb21iaW5lXG5cbiAgICAvKipAXG4gICAgICogIy5lcXVhbHNcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5NYXRyaXgyRFxuICAgICAqXG4gICAgICogQ2hlY2tzIGZvciB0aGUgbnVtZXJpYyBlcXVhbGl0eSBvZiB0aGlzIG1hdHJpeCB2ZXJzdXMgYW5vdGhlci5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge0Jvb2xlYW59IGVxdWFscyhNYXRyaXgyRCk7XG4gICAgICogQHBhcmFtIHtNYXRyaXgyRH0gbXRyeFJIXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgdGhlIHR3byBtYXRyaWNlcyBhcmUgbnVtZXJpY2FsbHkgZXF1YWxcbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKG10cnhSSCkge1xuICAgICAgICByZXR1cm4gbXRyeFJIIGluc3RhbmNlb2YgTWF0cml4MkQgJiZcbiAgICAgICAgICAgIHRoaXMuYSA9PSBtdHJ4UkguYSAmJiB0aGlzLmIgPT0gbXRyeFJILmIgJiYgdGhpcy5jID09IG10cnhSSC5jICYmXG4gICAgICAgICAgICB0aGlzLmQgPT0gbXRyeFJILmQgJiYgdGhpcy5lID09IG10cnhSSC5lICYmIHRoaXMuZiA9PSBtdHJ4UkguZjtcbiAgICB9OyAvLyBlcXVhbHNcblxuICAgIC8qKkBcbiAgICAgKiAjLmRldGVybWluYW50XG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIENhbGN1bGF0ZXMgdGhlIGRldGVybWluYW50IG9mIHRoaXMgbWF0cml4XG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtOdW1iZXJ9IGRldGVybWluYW50KCk7XG4gICAgICogQHJldHVybnMge051bWJlcn0gZGV0KHRoaXMgbWF0cml4KVxuICAgICAqL1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS5kZXRlcm1pbmFudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYSAqIHRoaXMuZCAtIHRoaXMuYiAqIHRoaXMuYztcbiAgICB9OyAvLyBkZXRlcm1pbmFudFxuXG4gICAgLyoqQFxuICAgICAqICMuaW52ZXJ0XG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIEludmVydHMgdGhpcyBtYXRyaXggaWYgcG9zc2libGVcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSBpbnZlcnQoKTtcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4MkR9IHRoaXMgaW52ZXJ0ZWQgbWF0cml4IG9yIHRoZSBvcmlnaW5hbCBtYXRyaXggb24gZmFpbHVyZVxuICAgICAqIEBzZWUgLmlzSW52ZXJ0aWJsZVxuICAgICAqL1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS5pbnZlcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBkZXQgPSB0aGlzLmRldGVybWluYW50KCk7XG5cbiAgICAgICAgLy8gbWF0cml4IGlzIGludmVydGlibGUgaWYgaXRzIGRldGVybWluYW50IGlzIG5vbi16ZXJvXG4gICAgICAgIGlmIChkZXQgIT09IDApIHtcbiAgICAgICAgICAgIHZhciBvbGQgPSB7XG4gICAgICAgICAgICAgICAgYTogdGhpcy5hLFxuICAgICAgICAgICAgICAgIGI6IHRoaXMuYixcbiAgICAgICAgICAgICAgICBjOiB0aGlzLmMsXG4gICAgICAgICAgICAgICAgZDogdGhpcy5kLFxuICAgICAgICAgICAgICAgIGU6IHRoaXMuZSxcbiAgICAgICAgICAgICAgICBmOiB0aGlzLmZcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLmEgPSBvbGQuZCAvIGRldDtcbiAgICAgICAgICAgIHRoaXMuYiA9IC1vbGQuYiAvIGRldDtcbiAgICAgICAgICAgIHRoaXMuYyA9IC1vbGQuYyAvIGRldDtcbiAgICAgICAgICAgIHRoaXMuZCA9IG9sZC5hIC8gZGV0O1xuICAgICAgICAgICAgdGhpcy5lID0gKG9sZC5jICogb2xkLmYgLSBvbGQuZSAqIG9sZC5kKSAvIGRldDtcbiAgICAgICAgICAgIHRoaXMuZiA9IChvbGQuZSAqIG9sZC5iIC0gb2xkLmEgKiBvbGQuZikgLyBkZXQ7XG4gICAgICAgIH0gLy8gaWZcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9OyAvLyBpbnZlcnRcblxuICAgIC8qKkBcbiAgICAgKiAjLmlzSWRlbnRpdHlcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5NYXRyaXgyRFxuICAgICAqXG4gICAgICogUmV0dXJucyB0cnVlIGlmIHRoaXMgbWF0cml4IGlzIHRoZSBpZGVudGl0eSBtYXRyaXhcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge0Jvb2xlYW59IGlzSWRlbnRpdHkoKTtcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuaXNJZGVudGl0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYSA9PT0gMSAmJiB0aGlzLmIgPT09IDAgJiYgdGhpcy5jID09PSAwICYmIHRoaXMuZCA9PT0gMSAmJiB0aGlzLmUgPT09IDAgJiYgdGhpcy5mID09PSAwO1xuICAgIH07IC8vIGlzSWRlbnRpdHlcblxuICAgIC8qKkBcbiAgICAgKiAjLmlzSW52ZXJ0aWJsZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLk1hdHJpeDJEXG4gICAgICpcbiAgICAgKiBEZXRlcm1pbmVzIGlzIHRoaXMgbWF0cml4IGlzIGludmVydGlibGUuXG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtCb29sZWFufSBpc0ludmVydGlibGUoKTtcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSBpZiB0aGlzIG1hdHJpeCBpcyBpbnZlcnRpYmxlXG4gICAgICogQHNlZSAuaW52ZXJ0XG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLmlzSW52ZXJ0aWJsZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGV0ZXJtaW5hbnQoKSAhPT0gMDtcbiAgICB9OyAvLyBpc0ludmVydGlibGVcblxuICAgIC8qKkBcbiAgICAgKiAjLnByZVJvdGF0ZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLk1hdHJpeDJEXG4gICAgICpcbiAgICAgKiBBcHBsaWVzIGEgY291bnRlci1jbG9ja3dpc2UgcHJlLXJvdGF0aW9uIHRvIHRoaXMgbWF0cml4XG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtNYXRyaXgyRH0gcHJlUm90YXRlKE51bWJlcik7XG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHJhZHMgLSBhbmdsZSB0byByb3RhdGUgaW4gcmFkaWFuc1xuICAgICAqIEByZXR1cm5zIHtNYXRyaXgyRH0gdGhpcyBtYXRyaXggYWZ0ZXIgcHJlLXJvdGF0aW9uXG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLnByZVJvdGF0ZSA9IGZ1bmN0aW9uIChyYWRzKSB7XG4gICAgICAgIHZhciBuQ29zID0gTWF0aC5jb3MocmFkcyk7XG4gICAgICAgIHZhciBuU2luID0gTWF0aC5zaW4ocmFkcyk7XG5cbiAgICAgICAgdmFyIHRtcCA9IHRoaXMuYTtcbiAgICAgICAgdGhpcy5hID0gbkNvcyAqIHRtcCAtIG5TaW4gKiB0aGlzLmI7XG4gICAgICAgIHRoaXMuYiA9IG5TaW4gKiB0bXAgKyBuQ29zICogdGhpcy5iO1xuICAgICAgICB0bXAgPSB0aGlzLmM7XG4gICAgICAgIHRoaXMuYyA9IG5Db3MgKiB0bXAgLSBuU2luICogdGhpcy5kO1xuICAgICAgICB0aGlzLmQgPSBuU2luICogdG1wICsgbkNvcyAqIHRoaXMuZDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9OyAvLyBwcmVSb3RhdGVcblxuICAgIC8qKkBcbiAgICAgKiAjLnByZVNjYWxlXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIEFwcGxpZXMgYSBwcmUtc2NhbGluZyB0byB0aGlzIG1hdHJpeFxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IHByZVNjYWxlKE51bWJlclssIE51bWJlcl0pO1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY2FsYXJYXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtzY2FsYXJZXSBzY2FsYXJYIGlzIHVzZWQgaWYgc2NhbGFyWSBpcyB1bmRlZmluZWRcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4MkR9IHRoaXMgYWZ0ZXIgcHJlLXNjYWxpbmdcbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUucHJlU2NhbGUgPSBmdW5jdGlvbiAoc2NhbGFyWCwgc2NhbGFyWSkge1xuICAgICAgICBpZiAoc2NhbGFyWSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgc2NhbGFyWSA9IHNjYWxhclg7XG5cbiAgICAgICAgdGhpcy5hICo9IHNjYWxhclg7XG4gICAgICAgIHRoaXMuYiAqPSBzY2FsYXJZO1xuICAgICAgICB0aGlzLmMgKj0gc2NhbGFyWDtcbiAgICAgICAgdGhpcy5kICo9IHNjYWxhclk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gcHJlU2NhbGVcblxuICAgIC8qKkBcbiAgICAgKiAjLnByZVRyYW5zbGF0ZVxuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLk1hdHJpeDJEXG4gICAgICpcbiAgICAgKiBBcHBsaWVzIGEgcHJlLXRyYW5zbGF0aW9uIHRvIHRoaXMgbWF0cml4XG4gICAgICpcbiAgICAgKiBAcHVibGljXG4gICAgICogQHNpZ24gcHVibGljIHtNYXRyaXgyRH0gcHJlVHJhbnNsYXRlKFZlY3RvcjJEKTtcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSBwcmVUcmFuc2xhdGUoTnVtYmVyLCBOdW1iZXIpO1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfFZlY3RvcjJEfSBkeFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkeVxuICAgICAqIEByZXR1cm5zIHtNYXRyaXgyRH0gdGhpcyBtYXRyaXggYWZ0ZXIgcHJlLXRyYW5zbGF0aW9uXG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLnByZVRyYW5zbGF0ZSA9IGZ1bmN0aW9uIChkeCwgZHkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBkeCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgdGhpcy5lICs9IGR4O1xuICAgICAgICAgICAgdGhpcy5mICs9IGR5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lICs9IGR4Lng7XG4gICAgICAgICAgICB0aGlzLmYgKz0gZHgueTtcbiAgICAgICAgfSAvLyBlbHNlXG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gcHJlVHJhbnNsYXRlXG5cbiAgICAvKipAXG4gICAgICogIy5yb3RhdGVcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5NYXRyaXgyRFxuICAgICAqXG4gICAgICogQXBwbGllcyBhIGNvdW50ZXItY2xvY2t3aXNlIHBvc3Qtcm90YXRpb24gdG8gdGhpcyBtYXRyaXhcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSByb3RhdGUoTnVtYmVyKTtcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcmFkcyAtIGFuZ2xlIHRvIHJvdGF0ZSBpbiByYWRpYW5zXG4gICAgICogQHJldHVybnMge01hdHJpeDJEfSB0aGlzIG1hdHJpeCBhZnRlciByb3RhdGlvblxuICAgICAqL1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS5yb3RhdGUgPSBmdW5jdGlvbiAocmFkcykge1xuICAgICAgICB2YXIgbkNvcyA9IE1hdGguY29zKHJhZHMpO1xuICAgICAgICB2YXIgblNpbiA9IE1hdGguc2luKHJhZHMpO1xuXG4gICAgICAgIHZhciB0bXAgPSB0aGlzLmE7XG4gICAgICAgIHRoaXMuYSA9IG5Db3MgKiB0bXAgLSBuU2luICogdGhpcy5iO1xuICAgICAgICB0aGlzLmIgPSBuU2luICogdG1wICsgbkNvcyAqIHRoaXMuYjtcbiAgICAgICAgdG1wID0gdGhpcy5jO1xuICAgICAgICB0aGlzLmMgPSBuQ29zICogdG1wIC0gblNpbiAqIHRoaXMuZDtcbiAgICAgICAgdGhpcy5kID0gblNpbiAqIHRtcCArIG5Db3MgKiB0aGlzLmQ7XG4gICAgICAgIHRtcCA9IHRoaXMuZTtcbiAgICAgICAgdGhpcy5lID0gbkNvcyAqIHRtcCAtIG5TaW4gKiB0aGlzLmY7XG4gICAgICAgIHRoaXMuZiA9IG5TaW4gKiB0bXAgKyBuQ29zICogdGhpcy5mO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07IC8vIHJvdGF0ZVxuXG4gICAgLyoqQFxuICAgICAqICMuc2NhbGVcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5NYXRyaXgyRFxuICAgICAqXG4gICAgICogQXBwbGllcyBhIHBvc3Qtc2NhbGluZyB0byB0aGlzIG1hdHJpeFxuICAgICAqXG4gICAgICogQHB1YmxpY1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IHNjYWxlKE51bWJlclssIE51bWJlcl0pO1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY2FsYXJYXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IFtzY2FsYXJZXSBzY2FsYXJYIGlzIHVzZWQgaWYgc2NhbGFyWSBpcyB1bmRlZmluZWRcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4MkR9IHRoaXMgYWZ0ZXIgcG9zdC1zY2FsaW5nXG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLnNjYWxlID0gZnVuY3Rpb24gKHNjYWxhclgsIHNjYWxhclkpIHtcbiAgICAgICAgaWYgKHNjYWxhclkgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHNjYWxhclkgPSBzY2FsYXJYO1xuXG4gICAgICAgIHRoaXMuYSAqPSBzY2FsYXJYO1xuICAgICAgICB0aGlzLmIgKj0gc2NhbGFyWTtcbiAgICAgICAgdGhpcy5jICo9IHNjYWxhclg7XG4gICAgICAgIHRoaXMuZCAqPSBzY2FsYXJZO1xuICAgICAgICB0aGlzLmUgKj0gc2NhbGFyWDtcbiAgICAgICAgdGhpcy5mICo9IHNjYWxhclk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gc2NhbGVcblxuICAgIC8qKkBcbiAgICAgKiAjLnNldFZhbHVlc1xuICAgICAqIEBjb21wIENyYWZ0eS5tYXRoLk1hdHJpeDJEXG4gICAgICpcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZXMgb2YgdGhpcyBtYXRyaXhcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSBzZXRWYWx1ZXMoTWF0cml4MkQpO1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IHNldFZhbHVlcyhOdW1iZXIsIE51bWJlciwgTnVtYmVyLCBOdW1iZXIsIE51bWJlciwgTnVtYmVyKTtcbiAgICAgKiBAcGFyYW0ge01hdHJpeDJEfE51bWJlcn0gYVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBiXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGZcbiAgICAgKiBAcmV0dXJucyB7TWF0cml4MkR9IHRoaXMgbWF0cml4IGNvbnRhaW5pbmcgdGhlIG5ldyB2YWx1ZXNcbiAgICAgKi9cbiAgICBNYXRyaXgyRC5wcm90b3R5cGUuc2V0VmFsdWVzID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQsIGUsIGYpIHtcbiAgICAgICAgaWYgKGEgaW5zdGFuY2VvZiBNYXRyaXgyRCkge1xuICAgICAgICAgICAgdGhpcy5hID0gYS5hO1xuICAgICAgICAgICAgdGhpcy5iID0gYS5iO1xuICAgICAgICAgICAgdGhpcy5jID0gYS5jO1xuICAgICAgICAgICAgdGhpcy5kID0gYS5kO1xuICAgICAgICAgICAgdGhpcy5lID0gYS5lO1xuICAgICAgICAgICAgdGhpcy5mID0gYS5mO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5hID0gYTtcbiAgICAgICAgICAgIHRoaXMuYiA9IGI7XG4gICAgICAgICAgICB0aGlzLmMgPSBjO1xuICAgICAgICAgICAgdGhpcy5kID0gZDtcbiAgICAgICAgICAgIHRoaXMuZSA9IGU7XG4gICAgICAgICAgICB0aGlzLmYgPSBmO1xuICAgICAgICB9IC8vIGVsc2VcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9OyAvLyBzZXRWYWx1ZXNcblxuICAgIC8qKkBcbiAgICAgKiAjLnRvU3RyaW5nXG4gICAgICogQGNvbXAgQ3JhZnR5Lm1hdGguTWF0cml4MkRcbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGlzIG1hdHJpeC5cbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge1N0cmluZ30gdG9TdHJpbmcoKTtcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqL1xuICAgIE1hdHJpeDJELnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFwiTWF0cml4MkQoW1wiICsgdGhpcy5hICsgXCIsIFwiICsgdGhpcy5jICsgXCIsIFwiICsgdGhpcy5lICtcbiAgICAgICAgICAgIFwiXSBbXCIgKyB0aGlzLmIgKyBcIiwgXCIgKyB0aGlzLmQgKyBcIiwgXCIgKyB0aGlzLmYgKyBcIl0gWzAsIDAsIDFdKVwiO1xuICAgIH07IC8vIHRvU3RyaW5nXG5cbiAgICAvKipAXG4gICAgICogIy50cmFuc2xhdGVcbiAgICAgKiBAY29tcCBDcmFmdHkubWF0aC5NYXRyaXgyRFxuICAgICAqXG4gICAgICogQXBwbGllcyBhIHBvc3QtdHJhbnNsYXRpb24gdG8gdGhpcyBtYXRyaXhcbiAgICAgKlxuICAgICAqIEBwdWJsaWNcbiAgICAgKiBAc2lnbiBwdWJsaWMge01hdHJpeDJEfSB0cmFuc2xhdGUoVmVjdG9yMkQpO1xuICAgICAqIEBzaWduIHB1YmxpYyB7TWF0cml4MkR9IHRyYW5zbGF0ZShOdW1iZXIsIE51bWJlcik7XG4gICAgICogQHBhcmFtIHtOdW1iZXJ8VmVjdG9yMkR9IGR4XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGR5XG4gICAgICogQHJldHVybnMge01hdHJpeDJEfSB0aGlzIG1hdHJpeCBhZnRlciBwb3N0LXRyYW5zbGF0aW9uXG4gICAgICovXG4gICAgTWF0cml4MkQucHJvdG90eXBlLnRyYW5zbGF0ZSA9IGZ1bmN0aW9uIChkeCwgZHkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBkeCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgdGhpcy5lICs9IHRoaXMuYSAqIGR4ICsgdGhpcy5jICogZHk7XG4gICAgICAgICAgICB0aGlzLmYgKz0gdGhpcy5iICogZHggKyB0aGlzLmQgKiBkeTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZSArPSB0aGlzLmEgKiBkeC54ICsgdGhpcy5jICogZHgueTtcbiAgICAgICAgICAgIHRoaXMuZiArPSB0aGlzLmIgKiBkeC54ICsgdGhpcy5kICogZHgueTtcbiAgICAgICAgfSAvLyBlbHNlXG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTsgLy8gdHJhbnNsYXRlXG5cbiAgICByZXR1cm4gTWF0cml4MkQ7XG59KSgpOyIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgX3NjZW5lczoge30sXG4gICAgX2N1cnJlbnQ6IG51bGwsXG5cbiAgICAvKipAXG4gICAgICogI0NyYWZ0eS5zY2VuZVxuICAgICAqIEBjYXRlZ29yeSBTY2VuZXMsIFN0YWdlXG4gICAgICogQHRyaWdnZXIgU2NlbmVDaGFuZ2UgLSBqdXN0IGJlZm9yZSBhIG5ldyBzY2VuZSBpcyBpbml0aWFsaXplZCAtIHsgb2xkU2NlbmU6U3RyaW5nLCBuZXdTY2VuZTpTdHJpbmcgfVxuICAgICAqIEB0cmlnZ2VyIFNjZW5lRGVzdHJveSAtIGp1c3QgYmVmb3JlIHRoZSBjdXJyZW50IHNjZW5lIGlzIGRlc3Ryb3llZCAtIHsgbmV3U2NlbmU6U3RyaW5nICB9XG4gICAgICpcbiAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkuc2NlbmUoU3RyaW5nIHNjZW5lTmFtZSwgRnVuY3Rpb24gaW5pdFssIEZ1bmN0aW9uIHVuaW5pdF0pXG4gICAgICogQHBhcmFtIHNjZW5lTmFtZSAtIE5hbWUgb2YgdGhlIHNjZW5lIHRvIGFkZFxuICAgICAqIEBwYXJhbSBpbml0IC0gRnVuY3Rpb24gdG8gZXhlY3V0ZSB3aGVuIHNjZW5lIGlzIHBsYXllZFxuICAgICAqIEBwYXJhbSB1bmluaXQgLSBGdW5jdGlvbiB0byBleGVjdXRlIGJlZm9yZSBuZXh0IHNjZW5lIGlzIHBsYXllZCwgYWZ0ZXIgZW50aXRpZXMgd2l0aCBgMkRgIGFyZSBkZXN0cm95ZWRcbiAgICAgKiBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gY2FsbGluZyBgQ3JhZnR5LmRlZmluZVNjZW5lYC5cbiAgICAgKlxuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5zY2VuZShTdHJpbmcgc2NlbmVOYW1lWywgRGF0YV0pXG4gICAgICogQHBhcmFtIHNjZW5lTmFtZSAtIE5hbWUgb2Ygc2NlbmUgdG8gcGxheVxuICAgICAqIEBwYXJhbSBEYXRhIC0gVGhlIGluaXQgZnVuY3Rpb24gb2YgdGhlIHNjZW5lIHdpbGwgYmUgY2FsbGVkIHdpdGggdGhpcyBkYXRhIGFzIGl0cyBwYXJhbWV0ZXIuICBDYW4gYmUgb2YgYW55IHR5cGUgb3RoZXIgdGhhbiBhIGZ1bmN0aW9uLlxuICAgICAqIFRoaXMgaXMgZXF1aXZhbGVudCB0byBjYWxsaW5nIGBDcmFmdHkuZW50ZXJTY2VuZWAuXG4gICAgICpcbiAgICAgKiBNZXRob2QgdG8gY3JlYXRlIHNjZW5lcyBvbiB0aGUgc3RhZ2UuIFBhc3MgYW4gSUQgYW5kIGZ1bmN0aW9uIHRvIHJlZ2lzdGVyIGEgc2NlbmUuXG4gICAgICpcbiAgICAgKiBUbyBwbGF5IGEgc2NlbmUsIGp1c3QgcGFzcyB0aGUgSUQuIFdoZW4gYSBzY2VuZSBpcyBwbGF5ZWQsIGFsbFxuICAgICAqIHByZXZpb3VzbHktY3JlYXRlZCBlbnRpdGllcyB3aXRoIHRoZSBgMkRgIGNvbXBvbmVudCBhcmUgZGVzdHJveWVkLiBUaGVcbiAgICAgKiB2aWV3cG9ydCBpcyBhbHNvIHJlc2V0LlxuICAgICAqXG4gICAgICogWW91IGNhbiBvcHRpb25hbGx5IHNwZWNpZnkgYW4gYXJ1Z21lbnQgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byB0aGUgc2NlbmUncyBpbml0IGZ1bmN0aW9uLlxuICAgICAqXG4gICAgICogSWYgeW91IHdhbnQgc29tZSBlbnRpdGllcyB0byBwZXJzaXN0IG92ZXIgc2NlbmVzIChhcyBpbiwgbm90IGJlIGRlc3Ryb3llZClcbiAgICAgKiBzaW1wbHkgYWRkIHRoZSBjb21wb25lbnQgYFBlcnNpc3RgLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZGVmaW5lU2NlbmUoXCJsb2FkaW5nXCIsIGZ1bmN0aW9uKCkge1xuICAgICAqICAgICBDcmFmdHkuYmFja2dyb3VuZChcIiMwMDBcIik7XG4gICAgICogICAgIENyYWZ0eS5lKFwiMkQsIERPTSwgVGV4dFwiKVxuICAgICAqICAgICAgICAgICAuYXR0cih7IHc6IDEwMCwgaDogMjAsIHg6IDE1MCwgeTogMTIwIH0pXG4gICAgICogICAgICAgICAgIC50ZXh0KFwiTG9hZGluZ1wiKVxuICAgICAqICAgICAgICAgICAuY3NzKHsgXCJ0ZXh0LWFsaWduXCI6IFwiY2VudGVyXCJ9KVxuICAgICAqICAgICAgICAgICAudGV4dENvbG9yKFwiI0ZGRkZGRlwiKTtcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIENyYWZ0eS5kZWZpbmVTY2VuZShcIlVGT19kYW5jZVwiLFxuICAgICAqICAgICAgICAgICAgICBmdW5jdGlvbigpIHtDcmFmdHkuYmFja2dyb3VuZChcIiM0NDRcIik7IENyYWZ0eS5lKFwiVUZPXCIpO30sXG4gICAgICogICAgICAgICAgICAgIGZ1bmN0aW9uKCkgey4uLnNlbmQgbWVzc2FnZSB0byBzZXJ2ZXIuLi59KTtcbiAgICAgKlxuICAgICAqIC8vIEFuIGV4YW1wbGUgb2YgYW4gaW5pdCBmdW5jdGlvbiB3aGljaCBhY2NlcHRzIGFyZ3VtZW50cywgaW4gdGhpcyBjYXNlIGFuIG9iamVjdC5cbiAgICAgKiBDcmFmdHkuZGVmaW5lU2NlbmUoXCJzcXVhcmVcIiwgZnVuY3Rpb24oYXR0cmlidXRlcykge1xuICAgICAqICAgICBDcmFmdHkuYmFja2dyb3VuZChcIiMwMDBcIik7XG4gICAgICogICAgIENyYWZ0eS5lKFwiMkQsIERPTSwgQ29sb3JcIilcbiAgICAgKiAgICAgICAgICAgLmF0dHIoYXR0cmlidXRlcylcbiAgICAgKiAgICAgICAgICAgLmNvbG9yKFwicmVkXCIpO1xuICAgICAqIFxuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogfn5+XG4gICAgICogVGhpcyBkZWZpbmVzIChidXQgZG9lcyBub3QgcGxheSkgdHdvIHNjZW5lcyBhcyBkaXNjdXNzZWQgYmVsb3cuXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmVudGVyU2NlbmUoXCJsb2FkaW5nXCIpO1xuICAgICAqIH5+flxuICAgICAqIFRoaXMgY29tbWFuZCB3aWxsIGNsZWFyIHRoZSBzdGFnZSBieSBkZXN0cm95aW5nIGFsbCBgMkRgIGVudGl0aWVzIChleGNlcHRcbiAgICAgKiB0aG9zZSB3aXRoIHRoZSBgUGVyc2lzdGAgY29tcG9uZW50KS4gVGhlbiBpdCB3aWxsIHNldCB0aGUgYmFja2dyb3VuZCB0b1xuICAgICAqIGJsYWNrIGFuZCBkaXNwbGF5IHRoZSB0ZXh0IFwiTG9hZGluZ1wiLlxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lbnRlclNjZW5lKFwiVUZPX2RhbmNlXCIpO1xuICAgICAqIH5+flxuICAgICAqIFRoaXMgY29tbWFuZCB3aWxsIGNsZWFyIHRoZSBzdGFnZSBieSBkZXN0cm95aW5nIGFsbCBgMkRgIGVudGl0aWVzIChleGNlcHRcbiAgICAgKiB0aG9zZSB3aXRoIHRoZSBgUGVyc2lzdGAgY29tcG9uZW50KS4gVGhlbiBpdCB3aWxsIHNldCB0aGUgYmFja2dyb3VuZCB0b1xuICAgICAqIGdyYXkgYW5kIGNyZWF0ZSBhIFVGTyBlbnRpdHkuIEZpbmFsbHksIHRoZSBuZXh0IHRpbWUgdGhlIGdhbWUgZW5jb3VudGVyc1xuICAgICAqIGFub3RoZXIgY29tbWFuZCBvZiB0aGUgZm9ybSBgQ3JhZnR5LnNjZW5lKHNjZW5lX25hbWUpYCAoaWYgZXZlciksIHRoZW4gdGhlXG4gICAgICogZ2FtZSB3aWxsIHNlbmQgYSBtZXNzYWdlIHRvIHRoZSBzZXJ2ZXIuXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmVudGVyU2NlbmUoXCJzcXVhcmVcIiwge3g6MTAsIHk6MTAsIHc6MjAsIGg6MjB9KTtcbiAgICAgKiB+fn5cbiAgICAgKiBUaGlzIHdpbGwgY2xlYXIgdGhlIHN0YWdlLCBzZXQgdGhlIGJhY2tncm91bmQgYmxhY2ssIGFuZCBjcmVhdGUgYSByZWQgc3F1YXJlIHdpdGggdGhlIHNwZWNpZmllZCBwb3NpdGlvbiBhbmQgZGltZW5zaW9ucy5cbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBzY2VuZTogZnVuY3Rpb24gKG5hbWUsIGludHJvLCBvdXRybykge1xuICAgICAgICAvLyBJZiB0aGVyZSdzIG9uZSBhcmd1bWVudCwgb3IgdGhlIHNlY29uZCBhcmd1bWVudCBpc24ndCBhIGZ1bmN0aW9uLCBwbGF5IHRoZSBzY2VuZVxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSB8fCB0eXBlb2YoYXJndW1lbnRzWzFdKSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBDcmFmdHkuZW50ZXJTY2VuZShuYW1lLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIE90aGVyd2lzZSwgdGhpcyBpcyBhIGNhbGwgdG8gY3JlYXRlIGEgc2NlbmVcbiAgICAgICAgQ3JhZnR5LmRlZmluZVNjZW5lKG5hbWUsIGludHJvLCBvdXRybyk7XG4gICAgfSxcblxuICAgIC8qIFxuICAgICAqICNDcmFmdHkuZGVmaW5lU2NlbmVcbiAgICAgKiBAY2F0ZWdvcnkgU2NlbmVzLCBTdGFnZVxuICAgICAqXG4gICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5LmVudGVyU2NlbmUoU3RyaW5nIG5hbWVbLCBEYXRhXSlcbiAgICAgKiBAcGFyYW0gbmFtZSAtIE5hbWUgb2YgdGhlIHNjZW5lIHRvIHJ1bi5cbiAgICAgKiBAcGFyYW0gRGF0YSAtIFRoZSBpbml0IGZ1bmN0aW9uIG9mIHRoZSBzY2VuZSB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoaXMgZGF0YSBhcyBpdHMgcGFyYW1ldGVyLiAgQ2FuIGJlIG9mIGFueSB0eXBlIG90aGVyIHRoYW4gYSBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIEBzZWUgQ3JhZnR5LmVudGVyU2NlbmVcbiAgICAgKiBAc2VlIENyYWZ0eS5zY2VuZVxuICAgICAqL1xuICAgIGRlZmluZVNjZW5lOiBmdW5jdGlvbihuYW1lLCBpbml0LCB1bmluaXQpe1xuICAgICAgICBpZiAodHlwZW9mIGluaXQgIT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHRocm93KFwiSW5pdCBmdW5jdGlvbiBpcyB0aGUgd3JvbmcgdHlwZS5cIik7XG4gICAgICAgIHRoaXMuX3NjZW5lc1tuYW1lXSA9IHt9O1xuICAgICAgICB0aGlzLl9zY2VuZXNbbmFtZV0uaW5pdGlhbGl6ZSA9IGluaXQ7XG4gICAgICAgIGlmICh0eXBlb2YgdW5pbml0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhpcy5fc2NlbmVzW25hbWVdLnVuaW5pdGlhbGl6ZSA9IHVuaW5pdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG5cbiAgICB9LFxuXG4gICAgLyogXG4gICAgICogI0NyYWZ0eS5lbnRlclNjZW5lXG4gICAgICogQGNhdGVnb3J5IFNjZW5lcywgU3RhZ2VcbiAgICAgKiBAdHJpZ2dlciBTY2VuZUNoYW5nZSAtIGp1c3QgYmVmb3JlIGEgbmV3IHNjZW5lIGlzIGluaXRpYWxpemVkIC0geyBvbGRTY2VuZTpTdHJpbmcsIG5ld1NjZW5lOlN0cmluZyB9XG4gICAgICogQHRyaWdnZXIgU2NlbmVEZXN0cm95IC0ganVzdCBiZWZvcmUgdGhlIGN1cnJlbnQgc2NlbmUgaXMgZGVzdHJveWVkIC0geyBuZXdTY2VuZTpTdHJpbmcgIH1cbiAgICAgKlxuICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS5lbnRlclNjZW5lKFN0cmluZyBuYW1lWywgRGF0YV0pXG4gICAgICogQHBhcmFtIG5hbWUgLSBOYW1lIG9mIHRoZSBzY2VuZSB0byBydW4uXG4gICAgICogQHBhcmFtIERhdGEgLSBUaGUgaW5pdCBmdW5jdGlvbiBvZiB0aGUgc2NlbmUgd2lsbCBiZSBjYWxsZWQgd2l0aCB0aGlzIGRhdGEgYXMgaXRzIHBhcmFtZXRlci4gIENhbiBiZSBvZiBhbnkgdHlwZSBvdGhlciB0aGFuIGEgZnVuY3Rpb24uXG4gICAgICogXG4gICAgICogQHNlZSBDcmFmdHkuZGVmaW5lU2NlbmVcbiAgICAgKiBAc2VlIENyYWZ0eS5zY2VuZVxuICAgICAqL1xuICAgIGVudGVyU2NlbmU6IGZ1bmN0aW9uKG5hbWUsIGRhdGEpe1xuICAgICAgICBpZiAodHlwZW9mIGRhdGEgPT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHRocm93KFwiU2NlbmUgZGF0YSBjYW5ub3QgYmUgYSBmdW5jdGlvblwiKTtcblxuICAgICAgICAvLyAtLS1GWUktLS1cbiAgICAgICAgLy8gdGhpcy5fY3VycmVudCBpcyB0aGUgbmFtZSAoSUQpIG9mIHRoZSBzY2VuZSBpbiBwcm9ncmVzcy5cbiAgICAgICAgLy8gdGhpcy5fc2NlbmVzIGlzIGFuIG9iamVjdCBsaWtlIHRoZSBmb2xsb3dpbmc6XG4gICAgICAgIC8vIHsnT3BlbmluZyBzY2VuZSc6IHsnaW5pdGlhbGl6ZSc6IGZuQSwgJ3VuaW5pdGlhbGl6ZSc6IGZuQn0sXG4gICAgICAgIC8vICAnQW5vdGhlciBzY2VuZSc6IHsnaW5pdGlhbGl6ZSc6IGZuQywgJ3VuaW5pdGlhbGl6ZSc6IGZuRH19XG5cbiAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJTY2VuZURlc3Ryb3lcIiwge1xuICAgICAgICAgICAgbmV3U2NlbmU6IG5hbWVcbiAgICAgICAgfSk7XG4gICAgICAgIENyYWZ0eS52aWV3cG9ydC5yZXNldCgpO1xuXG4gICAgICAgIENyYWZ0eShcIjJEXCIpLmVhY2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmhhcyhcIlBlcnNpc3RcIikpIHRoaXMuZGVzdHJveSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gdW5pbml0aWFsaXplIHByZXZpb3VzIHNjZW5lXG4gICAgICAgIGlmICh0aGlzLl9jdXJyZW50ICE9PSBudWxsICYmICd1bmluaXRpYWxpemUnIGluIHRoaXMuX3NjZW5lc1t0aGlzLl9jdXJyZW50XSkge1xuICAgICAgICAgICAgdGhpcy5fc2NlbmVzW3RoaXMuX2N1cnJlbnRdLnVuaW5pdGlhbGl6ZS5jYWxsKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGluaXRpYWxpemUgbmV4dCBzY2VuZVxuICAgICAgICB2YXIgb2xkU2NlbmUgPSB0aGlzLl9jdXJyZW50O1xuICAgICAgICB0aGlzLl9jdXJyZW50ID0gbmFtZTtcbiAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJTY2VuZUNoYW5nZVwiLCB7XG4gICAgICAgICAgICBvbGRTY2VuZTogb2xkU2NlbmUsXG4gICAgICAgICAgICBuZXdTY2VuZTogbmFtZVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fc2NlbmVzW25hbWVdLmluaXRpYWxpemUuY2FsbCh0aGlzLCBkYXRhKTtcblxuICAgICAgICByZXR1cm47XG5cbiAgICB9XG59KTsiLCJ2YXIgQ3JhZnR5ID0gcmVxdWlyZSgnLi9jb3JlLmpzJyksXG4gICAgZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQ7XG5cbkNyYWZ0eS5leHRlbmQoe1xuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LmF1ZGlvXG4gICAgICogQGNhdGVnb3J5IEF1ZGlvXG4gICAgICpcbiAgICAgKiBBZGQgc291bmQgZmlsZXMgYW5kIHBsYXkgdGhlbS4gQ2hvb3NlcyBiZXN0IGZvcm1hdCBmb3IgYnJvd3NlciBzdXBwb3J0LlxuICAgICAqIER1ZSB0byB0aGUgbmF0dXJlIG9mIEhUTUw1IGF1ZGlvLCB0aHJlZSB0eXBlcyBvZiBhdWRpbyBmaWxlcyB3aWxsIGJlXG4gICAgICogcmVxdWlyZWQgZm9yIGNyb3NzLWJyb3dzZXIgY2FwYWJpbGl0aWVzLiBUaGVzZSBmb3JtYXRzIGFyZSBNUDMsIE9nZyBhbmQgV0FWLlxuICAgICAqIFdoZW4gc291bmQgd2FzIG5vdCBtdXRlZCBvbiBiZWZvcmUgcGF1c2UsIHNvdW5kIHdpbGwgYmUgdW5tdXRlZCBhZnRlciB1bnBhdXNlLlxuICAgICAqIFdoZW4gc291bmQgaXMgbXV0ZWQgQ3JhZnR5LnBhdXNlKCkgZG9lcyBub3QgaGF2ZSBhbnkgZWZmZWN0IG9uIHNvdW5kXG4gICAgICpcbiAgICAgKiBUaGUgbWF4aW11bSBudW1iZXIgb2Ygc291bmRzIHRoYXQgY2FuIGJlIHBsYXllZCBzaW11bHRhbmVvdXNseSBpcyBkZWZpbmVkIGJ5IENyYWZ0eS5hdWRpby5tYXhDaGFubmVscy4gIFRoZSBkZWZhdWx0IHZhbHVlIGlzIDcuXG4gICAgICovXG4gICAgYXVkaW86IHtcblxuICAgICAgICBzb3VuZHM6IHt9LFxuICAgICAgICBzdXBwb3J0ZWQ6IG51bGwsXG4gICAgICAgIGNvZGVjczogeyAvLyBDaGFydCBmcm9tIGpQbGF5ZXJcbiAgICAgICAgICAgIG9nZzogJ2F1ZGlvL29nZzsgY29kZWNzPVwidm9yYmlzXCInLCAvL09HR1xuICAgICAgICAgICAgd2F2OiAnYXVkaW8vd2F2OyBjb2RlY3M9XCIxXCInLCAvLyBQQ01cbiAgICAgICAgICAgIHdlYm1hOiAnYXVkaW8vd2VibTsgY29kZWNzPVwidm9yYmlzXCInLCAvLyBXRUJNXG4gICAgICAgICAgICBtcDM6ICdhdWRpby9tcGVnOyBjb2RlY3M9XCJtcDNcIicsIC8vTVAzXG4gICAgICAgICAgICBtNGE6ICdhdWRpby9tcDQ7IGNvZGVjcz1cIm1wNGEuNDAuMlwiJyAvLyBBQUMgLyBNUDRcbiAgICAgICAgfSxcbiAgICAgICAgdm9sdW1lOiAxLCAvL0dsb2JhbCBWb2x1bWVcbiAgICAgICAgbXV0ZWQ6IGZhbHNlLFxuICAgICAgICBwYXVzZWQ6IGZhbHNlLFxuICAgICAgICBwbGF5Q2hlY2s6IG51bGwsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBGdW5jdGlvbiB0byBzZXR1cCBzdXBwb3J0ZWQgZm9ybWF0c1xuICAgICAgICAgKiovXG4gICAgICAgIF9jYW5QbGF5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnN1cHBvcnRlZCA9IHt9O1xuICAgICAgICAgICAgLy8gV2l0aG91dCBzdXBwb3J0LCBubyBmb3JtYXRzIGFyZSBzdXBwb3J0ZWRcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGF1ZGlvID0gdGhpcy5hdWRpb0VsZW1lbnQoKSxcbiAgICAgICAgICAgICAgICBjYW5wbGF5O1xuICAgICAgICAgICAgZm9yICh2YXIgaSBpbiB0aGlzLmNvZGVjcykge1xuICAgICAgICAgICAgICAgIGNhbnBsYXkgPSBhdWRpby5jYW5QbGF5VHlwZSh0aGlzLmNvZGVjc1tpXSk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbnBsYXkgIT09IFwiXCIgJiYgY2FucGxheSAhPT0gXCJub1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3VwcG9ydGVkW2ldID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnN1cHBvcnRlZFtpXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5zdXBwb3J0c1xuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnN1cHBvcnRzKFN0cmluZyBleHRlbnNpb24pXG4gICAgICAgICAqIEBwYXJhbSBleHRlbnNpb24gLSBBIGZpbGUgZXh0ZW5zaW9uIHRvIGNoZWNrIGF1ZGlvIHN1cHBvcnQgZm9yXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSBicm93c2VyIHRoaW5rcyBpdCBjYW4gcGxheSB0aGUgZ2l2ZW4gZmlsZSB0eXBlLCBvdGhlcndpc2UgZmFsc2VcbiAgICAgICAgICovXG4gICAgICAgIHN1cHBvcnRzOiBmdW5jdGlvbiAoZXh0ZW5zaW9uKSB7XG4gICAgICAgICAgICAvLyBCdWlsZCBjYWNoZSBvZiBzdXBwb3J0ZWQgZm9ybWF0cywgaWYgbmVjZXNzYXJ5XG4gICAgICAgICAgICBpZiAodGhpcy5zdXBwb3J0ZWQgPT09IG51bGwpXG4gICAgICAgICAgICAgICAgdGhpcy5fY2FuUGxheSgpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zdXBwb3J0ZWRbZXh0ZW5zaW9uXSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEZ1bmN0aW9uIHRvIGdldCBhbiBBdWRpbyBFbGVtZW50XG4gICAgICAgICAqKi9cbiAgICAgICAgYXVkaW9FbGVtZW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvL0lFIGRvZXMgbm90IHN1cHBvcnQgQXVkaW8gT2JqZWN0XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIEF1ZGlvICE9PSAndW5kZWZpbmVkJyA/IG5ldyBBdWRpbyhcIlwiKSA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2F1ZGlvJyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmF1ZGlvLmNyZWF0ZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLmNyZWF0ZShTdHJpbmcgaWQsIFN0cmluZyB1cmwpXG4gICAgICAgICAqIEBwYXJhbSBpZCAtIEEgc3RyaW5nIHRvIHJlZmVyIHRvIHNvdW5kc1xuICAgICAgICAgKiBAcGFyYW0gdXJsIC0gQSBzdHJpbmcgcG9pbnRpbmcgdG8gdGhlIHNvdW5kIGZpbGVcbiAgICAgICAgICpcbiAgICAgICAgICogQ3JlYXRlcyBhbiBhdWRpbyBhc3NldCB3aXRoIHRoZSBnaXZlbiBpZCBhbmQgcmVzb3VyY2UuICBgQ3JhZnR5LmF1ZGlvLmFkZGAgaXMgYSBtb3JlIGZsZXhpYmxlIGludGVyZmFjZSB0aGF0IGFsbG93cyBjcm9zcy1icm93c2VyIGNvbXBhdGliaWxpdHkuXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIHRoZSBzb3VuZCBmaWxlIGV4dGVuc2lvbiBpcyBub3Qgc3VwcG9ydGVkLCByZXR1cm5zIGZhbHNlOyBvdGhlcndpc2UsIHJldHVybnMgdGhlIGF1ZGlvIGFzc2V0LlxuICAgICAgICAgKi9cbiAgICAgICAgY3JlYXRlOiBmdW5jdGlvbiAoaWQsIHBhdGgpIHtcbiAgICAgICAgICAgIC8vY2hlY2sgZXh0ZW5zaW9uLCByZXR1cm4gaWYgbm90IHN1cHBvcnRlZFxuICAgICAgICAgICAgdmFyIGV4dCA9IHBhdGguc3Vic3RyKHBhdGgubGFzdEluZGV4T2YoJy4nKSArIDEpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoIXRoaXMuc3VwcG9ydHMoZXh0KSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vaW5pdGlhdGUgdGhlIGF1ZGlvIGVsZW1lbnRcbiAgICAgICAgICAgIHZhciBhdWRpbyA9IHRoaXMuYXVkaW9FbGVtZW50KCk7XG4gICAgICAgICAgICBhdWRpby5pZCA9IGlkO1xuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9IFwiYXV0b1wiO1xuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gQ3JhZnR5LmF1ZGlvLnZvbHVtZTtcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHBhdGg7XG5cbiAgICAgICAgICAgIC8vY3JlYXRlIGFuIGFzc2V0IGFuZCBtZXRhZGF0YSBmb3IgdGhlIGF1ZGlvIGVsZW1lbnRcbiAgICAgICAgICAgIENyYWZ0eS5hc3NldChwYXRoLCBhdWRpbyk7XG4gICAgICAgICAgICB0aGlzLnNvdW5kc1tpZF0gPSB7XG4gICAgICAgICAgICAgICAgb2JqOiBhdWRpbyxcbiAgICAgICAgICAgICAgICBwbGF5ZWQ6IDAsXG4gICAgICAgICAgICAgICAgdm9sdW1lOiBDcmFmdHkuYXVkaW8udm9sdW1lXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc291bmRzW2lkXTtcblxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5hZGRcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LmF1ZGlvXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby5hZGQoU3RyaW5nIGlkLCBTdHJpbmcgdXJsKVxuICAgICAgICAgKiBAcGFyYW0gaWQgLSBBIHN0cmluZyB0byByZWZlciB0byBzb3VuZHNcbiAgICAgICAgICogQHBhcmFtIHVybCAtIEEgc3RyaW5nIHBvaW50aW5nIHRvIHRoZSBzb3VuZCBmaWxlXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby5hZGQoU3RyaW5nIGlkLCBBcnJheSB1cmxzKVxuICAgICAgICAgKiBAcGFyYW0gdXJscyAtIEFycmF5IG9mIHVybHMgcG9pbnRpbmcgdG8gZGlmZmVyZW50IGZvcm1hdCBvZiB0aGUgc2FtZSBzb3VuZCwgc2VsZWN0aW5nIHRoZSBmaXJzdCB0aGF0IGlzIHBsYXlhYmxlXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby5hZGQoT2JqZWN0IG1hcClcbiAgICAgICAgICogQHBhcmFtIG1hcCAtIGtleS12YWx1ZSBwYWlycyB3aGVyZSB0aGUga2V5IGlzIHRoZSBgaWRgIGFuZCB0aGUgdmFsdWUgaXMgZWl0aGVyIGEgYHVybGAgb3IgYHVybHNgXG4gICAgICAgICAqXG4gICAgICAgICAqIExvYWRzIGEgc291bmQgdG8gYmUgcGxheWVkLiBEdWUgdG8gdGhlIG5hdHVyZSBvZiBIVE1MNSBhdWRpbyxcbiAgICAgICAgICogdGhyZWUgdHlwZXMgb2YgYXVkaW8gZmlsZXMgd2lsbCBiZSByZXF1aXJlZCBmb3IgY3Jvc3MtYnJvd3NlciBjYXBhYmlsaXRpZXMuXG4gICAgICAgICAqIFRoZXNlIGZvcm1hdHMgYXJlIE1QMywgT2dnIGFuZCBXQVYuXG4gICAgICAgICAqXG4gICAgICAgICAqIFBhc3NpbmcgYW4gYXJyYXkgb2YgVVJMcyB3aWxsIGRldGVybWluZSB3aGljaCBmb3JtYXQgdGhlIGJyb3dzZXIgY2FuIHBsYXkgYW5kIHNlbGVjdCBpdCBvdmVyIGFueSBvdGhlci5cbiAgICAgICAgICpcbiAgICAgICAgICogQWNjZXB0cyBhbiBvYmplY3Qgd2hlcmUgdGhlIGtleSBpcyB0aGUgYXVkaW8gbmFtZSBhbmRcbiAgICAgICAgICogZWl0aGVyIGEgVVJMIG9yIGFuIEFycmF5IG9mIFVSTHMgKHRvIGRldGVybWluZSB3aGljaCB0eXBlIHRvIHVzZSkuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoZSBJRCB5b3UgdXNlIHdpbGwgYmUgaG93IHlvdSByZWZlciB0byB0aGF0IHNvdW5kIHdoZW4gdXNpbmcgYENyYWZ0eS5hdWRpby5wbGF5YC5cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIC8vYWRkaW5nIGF1ZGlvIGZyb20gYW4gb2JqZWN0XG4gICAgICAgICAqIENyYWZ0eS5hdWRpby5hZGQoe1xuICAgICAgICAgKiBzaG9vdDogW1wic291bmRzL3Nob290LndhdlwiLFxuICAgICAgICAgKiBcInNvdW5kcy9zaG9vdC5tcDNcIixcbiAgICAgICAgICogXCJzb3VuZHMvc2hvb3Qub2dnXCJdLFxuICAgICAgICAgKlxuICAgICAgICAgKiBjb2luOiBcInNvdW5kcy9jb2luLm1wM1wiXG4gICAgICAgICAqIH0pO1xuICAgICAgICAgKlxuICAgICAgICAgKiAvL2FkZGluZyBhIHNpbmdsZSBzb3VuZFxuICAgICAgICAgKiBDcmFmdHkuYXVkaW8uYWRkKFwid2Fsa1wiLCBbXG4gICAgICAgICAqIFwic291bmRzL3dhbGsubXAzXCIsXG4gICAgICAgICAqIFwic291bmRzL3dhbGsub2dnXCIsXG4gICAgICAgICAqIFwic291bmRzL3dhbGsud2F2XCJcbiAgICAgICAgICogXSk7XG4gICAgICAgICAqXG4gICAgICAgICAqIC8vb25seSBvbmUgZm9ybWF0XG4gICAgICAgICAqIENyYWZ0eS5hdWRpby5hZGQoXCJqdW1wXCIsIFwic291bmRzL2p1bXAubXAzXCIpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIGFkZDogZnVuY3Rpb24gKGlkLCB1cmwpIHtcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgc3JjO1xuXG4gICAgICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgaWQgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpIGluIGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoc3JjIGluIGlkW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQ3JhZnR5LmF1ZGlvLmNyZWF0ZShpLCBpZFtpXVtzcmNdKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgaWQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHVybCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkuYXVkaW8uY3JlYXRlKGlkLCB1cmwpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdXJsID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoc3JjIGluIHVybCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKENyYWZ0eS5hdWRpby5jcmVhdGUoaWQsIHVybFtzcmNdKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuYXVkaW8ucGxheVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnBsYXkoU3RyaW5nIGlkKVxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuYXVkaW8ucGxheShTdHJpbmcgaWQsIE51bWJlciByZXBlYXRDb3VudClcbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnBsYXkoU3RyaW5nIGlkLCBOdW1iZXIgcmVwZWF0Q291bnQsIE51bWJlciB2b2x1bWUpXG4gICAgICAgICAqIEBwYXJhbSBpZCAtIEEgc3RyaW5nIHRvIHJlZmVyIHRvIHNvdW5kc1xuICAgICAgICAgKiBAcGFyYW0gcmVwZWF0Q291bnQgLSBSZXBlYXQgY291bnQgZm9yIHRoZSBmaWxlLCB3aGVyZSAtMSBzdGFuZHMgZm9yIHJlcGVhdCBmb3JldmVyLlxuICAgICAgICAgKiBAcGFyYW0gdm9sdW1lIC0gdm9sdW1lIGNhbiBiZSBhIG51bWJlciBiZXR3ZWVuIDAuMCBhbmQgMS4wXG4gICAgICAgICAqIEByZXR1cm5zIFRoZSBhdWRpbyBlbGVtZW50IHVzZWQgdG8gcGxheSB0aGUgc291bmQuICBOdWxsIGlmIHRoZSBjYWxsIGZhaWxlZCBkdWUgdG8gYSBsYWNrIG9mIG9wZW4gY2hhbm5lbHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIFdpbGwgcGxheSBhIHNvdW5kIHByZXZpb3VzbHkgYWRkZWQgYnkgdXNpbmcgdGhlIElEIHRoYXQgd2FzIHVzZWQgaW4gYENyYWZ0eS5hdWRpby5hZGRgLlxuICAgICAgICAgKiBIYXMgYSBkZWZhdWx0IG1heGltdW0gb2YgNSBjaGFubmVscyBzbyB0aGF0IHRoZSBzYW1lIHNvdW5kIGNhbiBwbGF5IHNpbXVsdGFuZW91c2x5IHVubGVzcyBhbGwgb2YgdGhlIGNoYW5uZWxzIGFyZSBwbGF5aW5nLlxuXG4gICAgICAgICAqICpOb3RlIHRoYXQgdGhlIGltcGxlbWVudGF0aW9uIG9mIEhUTUw1IEF1ZGlvIGlzIGJ1Z2d5IGF0IGJlc3QuKlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogQ3JhZnR5LmF1ZGlvLnBsYXkoXCJ3YWxrXCIpO1xuICAgICAgICAgKlxuICAgICAgICAgKiAvL3BsYXkgYW5kIHJlcGVhdCBmb3JldmVyXG4gICAgICAgICAqIENyYWZ0eS5hdWRpby5wbGF5KFwiYmFja2dyb3VuZE11c2ljXCIsIC0xKTtcbiAgICAgICAgICogQ3JhZnR5LmF1ZGlvLnBsYXkoXCJleHBsb3Npb25cIiwxLDAuNSk7IC8vcGxheSBzb3VuZCBvbmNlIHdpdGggdm9sdW1lIG9mIDUwJVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHBsYXk6IGZ1bmN0aW9uIChpZCwgcmVwZWF0LCB2b2x1bWUpIHtcbiAgICAgICAgICAgIGlmIChyZXBlYXQgPT09IDAgfHwgIUNyYWZ0eS5zdXBwb3J0LmF1ZGlvIHx8ICF0aGlzLnNvdW5kc1tpZF0pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIHMgPSB0aGlzLnNvdW5kc1tpZF07XG4gICAgICAgICAgICB2YXIgYyA9IHRoaXMuZ2V0T3BlbkNoYW5uZWwoKTtcbiAgICAgICAgICAgIGlmICghYylcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGMuaWQgPSBpZDtcbiAgICAgICAgICAgIGMucmVwZWF0ID0gcmVwZWF0O1xuICAgICAgICAgICAgdmFyIGEgPSBjLm9iajtcblxuXG4gICAgICAgICAgICBjLnZvbHVtZSA9IHMudm9sdW1lID0gcy5vYmoudm9sdW1lID0gdm9sdW1lIHx8IENyYWZ0eS5hdWRpby52b2x1bWU7XG5cbiAgICAgICAgICAgIGEudm9sdW1lID0gcy52b2x1bWU7XG4gICAgICAgICAgICBhLnNyYyA9IHMub2JqLnNyYztcblxuICAgICAgICAgICAgaWYgKHRoaXMubXV0ZWQpXG4gICAgICAgICAgICAgICAgYS52b2x1bWUgPSAwO1xuICAgICAgICAgICAgYS5wbGF5KCk7XG4gICAgICAgICAgICBzLnBsYXllZCsrO1xuICAgICAgICAgICAgYy5vbkVuZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAocy5wbGF5ZWQgPCBjLnJlcGVhdCB8fCByZXBlYXQgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudFRpbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5KCk7XG4gICAgICAgICAgICAgICAgICAgIHMucGxheWVkKys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYy5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXVzZSgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJlbmRlZFwiLCBjLm9uRW5kLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiU291bmRDb21wbGV0ZVwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogYy5pZFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhLmFkZEV2ZW50TGlzdGVuZXIoXCJlbmRlZFwiLCBjLm9uRW5kLCB0cnVlKTtcblxuICAgICAgICAgICAgcmV0dXJuIGE7XG4gICAgICAgIH0sXG5cblxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5zZXRDaGFubmVsc1xuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnNldENoYW5uZWxzKE51bWJlciBuKVxuICAgICAgICAgKiBAcGFyYW0gbiAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBjaGFubmVsc1xuICAgICAgICAgKi9cbiAgICAgICAgbWF4Q2hhbm5lbHM6IDcsXG4gICAgICAgIHNldENoYW5uZWxzOiBmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgdGhpcy5tYXhDaGFubmVscyA9IG47XG4gICAgICAgICAgICBpZiAobiA8IHRoaXMuY2hhbm5lbHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMubGVuZ3RoID0gbjtcbiAgICAgICAgfSxcblxuICAgICAgICBjaGFubmVsczogW10sXG4gICAgICAgIC8vIEZpbmRzIGFuIHVudXNlZCBhdWRpbyBlbGVtZW50LCBtYXJrcyBpdCBhcyBpbiB1c2UsIGFuZCByZXR1cm4gaXQuXG4gICAgICAgIGdldE9wZW5DaGFubmVsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hhbm5lbHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hhbiA9IHRoaXMuY2hhbm5lbHNbaV07XG4gICAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAgICogU2Vjb25kIHRlc3QgbG9va3MgZm9yIHN0dWZmIHRoYXQncyBvdXQgb2YgdXNlLFxuICAgICAgICAgICAgICAgICAgICogYnV0IGZhbGxlbiBmb3VsIG9mIENocm9taXVtIGJ1ZyAyODA0MTdcbiAgICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGlmIChjaGFuLmFjdGl2ZSA9PT0gZmFsc2UgfHxcbiAgICAgICAgICAgICAgICAgICAgICBjaGFuLm9iai5lbmRlZCAmJiBjaGFuLnJlcGVhdCA8PSB0aGlzLnNvdW5kc1tjaGFuLmlkXS5wbGF5ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2hhbi5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2hhbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiBuZWNlc3NhcnksIGNyZWF0ZSBhIG5ldyBlbGVtZW50LCB1bmxlc3Mgd2UndmUgYWxyZWFkeSByZWFjaGVkIHRoZSBtYXggbGltaXRcbiAgICAgICAgICAgIGlmIChpIDwgdGhpcy5tYXhDaGFubmVscykge1xuICAgICAgICAgICAgICAgIHZhciBjID0ge1xuICAgICAgICAgICAgICAgICAgICBvYmo6IHRoaXMuYXVkaW9FbGVtZW50KCksXG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2tzIHRoYXQgdGhlIGNoYW5uZWwgaXMgYmVpbmcgdXNlZCB0byBwbGF5IHNvdW5kIGlkXG4gICAgICAgICAgICAgICAgICAgIF9pczogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pZCA9PT0gaWQgJiYgdGhpcy5hY3RpdmU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHRoaXMuY2hhbm5lbHMucHVzaChjKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEluIHRoYXQgY2FzZSwgcmV0dXJuIG51bGxcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5yZW1vdmVcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LmF1ZGlvXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby5yZW1vdmUoW1N0cmluZyBpZF0pXG4gICAgICAgICAqIEBwYXJhbSBpZCAtIEEgc3RyaW5nIHRvIHJlZmVyIHRvIHNvdW5kc1xuICAgICAgICAgKlxuICAgICAgICAgKiBXaWxsIHN0b3AgdGhlIHNvdW5kIGFuZCByZW1vdmUgYWxsIHJlZmVyZW5jZXMgdG8gdGhlIGF1ZGlvIG9iamVjdCBhbGxvd2luZyB0aGUgYnJvd3NlciB0byBmcmVlIHRoZSBtZW1vcnkuXG4gICAgICAgICAqIElmIG5vIGlkIGlzIGdpdmVuLCBhbGwgc291bmRzIHdpbGwgYmUgcmVtb3ZlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIENyYWZ0eS5hdWRpby5yZW1vdmUoXCJ3YWxrXCIpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHJlbW92ZTogZnVuY3Rpb24gKGlkKSB7XG4gICAgICAgICAgICBpZiAoIUNyYWZ0eS5zdXBwb3J0LmF1ZGlvKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHM7XG5cbiAgICAgICAgICAgIGlmICghaWQpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpIGluIHRoaXMuc291bmRzKSB7XG4gICAgICAgICAgICAgICAgICAgIHMgPSB0aGlzLnNvdW5kc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LmF1ZGlvLnN0b3AoaWQpO1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgQ3JhZnR5LmFzc2V0c1tzLm9iai5zcmNdO1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgQ3JhZnR5LmF1ZGlvLnNvdW5kc1tpZF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGhpcy5zb3VuZHNbaWRdKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgcyA9IHRoaXMuc291bmRzW2lkXTtcbiAgICAgICAgICAgIENyYWZ0eS5hdWRpby5zdG9wKGlkKTtcbiAgICAgICAgICAgIGRlbGV0ZSBDcmFmdHkuYXNzZXRzW3Mub2JqLnNyY107XG4gICAgICAgICAgICBkZWxldGUgQ3JhZnR5LmF1ZGlvLnNvdW5kc1tpZF07XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5zdG9wXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5hdWRpb1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuYXVkaW8uc3RvcChbTnVtYmVyIElEXSlcbiAgICAgICAgICpcbiAgICAgICAgICogU3RvcHMgYW55IHBsYXlpbmcgc291bmQuIGlmIGlkIGlzIG5vdCBzZXQsIHN0b3AgYWxsIHNvdW5kcyB3aGljaCBhcmUgcGxheWluZ1xuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogLy9hbGwgc291bmRzIHN0b3BwZWQgcGxheWluZyBub3dcbiAgICAgICAgICogQ3JhZnR5LmF1ZGlvLnN0b3AoKTtcbiAgICAgICAgICpcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqL1xuICAgICAgICBzdG9wOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZm9yICh2YXIgaSBpbiB0aGlzLmNoYW5uZWxzKSB7XG4gICAgICAgICAgICAgICAgYyA9IHRoaXMuY2hhbm5lbHNbaV07XG4gICAgICAgICAgICAgICAgaWYgKCAoIWlkICYmIGMuYWN0aXZlKSB8fCBjLl9pcyhpZCkgKSB7XG4gICAgICAgICAgICAgICAgICAgIGMuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGMub2JqLnBhdXNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9LFxuICAgICAgICAvKipcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby5fbXV0ZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLl9tdXRlKFtCb29sZWFuIG11dGVdKVxuICAgICAgICAgKlxuICAgICAgICAgKiBNdXRlIG9yIHVubXV0ZSBldmVyeSBBdWRpbyBpbnN0YW5jZSB0aGF0IGlzIHBsYXlpbmcuXG4gICAgICAgICAqL1xuICAgICAgICBfbXV0ZTogZnVuY3Rpb24gKG11dGUpIHtcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICBmb3IgKHZhciBpIGluIHRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgICAgICAgICBjID0gdGhpcy5jaGFubmVsc1tpXTtcbiAgICAgICAgICAgICAgICBjLm9iai52b2x1bWUgPSBtdXRlID8gMCA6IGMudm9sdW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5tdXRlZCA9IG11dGU7XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby50b2dnbGVNdXRlXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5hdWRpb1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuYXVkaW8udG9nZ2xlTXV0ZSgpXG4gICAgICAgICAqXG4gICAgICAgICAqIE11dGUgb3IgdW5tdXRlIGV2ZXJ5IEF1ZGlvIGluc3RhbmNlIHRoYXQgaXMgcGxheWluZy4gVG9nZ2xlcyBiZXR3ZWVuXG4gICAgICAgICAqIHBhdXNpbmcgb3IgcGxheWluZyBkZXBlbmRpbmcgb24gdGhlIHN0YXRlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogLy90b2dnbGUgbXV0ZSBhbmQgdW5tdXRlIGRlcGVuZGluZyBvbiBjdXJyZW50IHN0YXRlXG4gICAgICAgICAqIENyYWZ0eS5hdWRpby50b2dnbGVNdXRlKCk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKi9cbiAgICAgICAgdG9nZ2xlTXV0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLm11dGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbXV0ZSh0cnVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fbXV0ZShmYWxzZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSxcbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmF1ZGlvLm11dGVcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LmF1ZGlvXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby5tdXRlKClcbiAgICAgICAgICpcbiAgICAgICAgICogTXV0ZSBldmVyeSBBdWRpbyBpbnN0YW5jZSB0aGF0IGlzIHBsYXlpbmcuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkuYXVkaW8ubXV0ZSgpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIG11dGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuX211dGUodHJ1ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby51bm11dGVcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LmF1ZGlvXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5hdWRpby51bm11dGUoKVxuICAgICAgICAgKlxuICAgICAgICAgKiBVbm11dGUgZXZlcnkgQXVkaW8gaW5zdGFuY2UgdGhhdCBpcyBwbGF5aW5nLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogQ3JhZnR5LmF1ZGlvLnVubXV0ZSgpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHVubXV0ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5fbXV0ZShmYWxzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LmF1ZGlvLnBhdXNlXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5hdWRpb1xuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyBDcmFmdHkuYXVkaW8ucGF1c2Uoc3RyaW5nIElEKVxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBUaGUgaWQgb2YgdGhlIGF1ZGlvIG9iamVjdCB0byBwYXVzZVxuICAgICAgICAgKlxuICAgICAgICAgKiBQYXVzZSB0aGUgQXVkaW8gaW5zdGFuY2Ugc3BlY2lmaWVkIGJ5IGlkIHBhcmFtLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAZXhhbXBsZVxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogQ3JhZnR5LmF1ZGlvLnBhdXNlKCdtdXNpYycpO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICpcbiAgICAgICAgICovXG4gICAgICAgIHBhdXNlOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8gfHwgIWlkIHx8ICF0aGlzLnNvdW5kc1tpZF0pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICBmb3IgKHZhciBpIGluIHRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgICAgICAgICBjID0gdGhpcy5jaGFubmVsc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoYy5faXMoaWQpICYmICFjLm9iai5wYXVzZWQpXG4gICAgICAgICAgICAgICAgICAgIGMub2JqLnBhdXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkuYXVkaW8udW5wYXVzZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnVucGF1c2Uoc3RyaW5nIElEKVxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBUaGUgaWQgb2YgdGhlIGF1ZGlvIG9iamVjdCB0byB1bnBhdXNlXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlc3VtZSBwbGF5aW5nIHRoZSBBdWRpbyBpbnN0YW5jZSBzcGVjaWZpZWQgYnkgaWQgcGFyYW0uXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkuYXVkaW8udW5wYXVzZSgnbXVzaWMnKTtcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqXG4gICAgICAgICAqL1xuICAgICAgICB1bnBhdXNlOiBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgIGlmICghQ3JhZnR5LnN1cHBvcnQuYXVkaW8gfHwgIWlkIHx8ICF0aGlzLnNvdW5kc1tpZF0pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICBmb3IgKHZhciBpIGluIHRoaXMuY2hhbm5lbHMpIHtcbiAgICAgICAgICAgICAgICBjID0gdGhpcy5jaGFubmVsc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAoYy5faXMoaWQpICYmIGMub2JqLnBhdXNlZClcbiAgICAgICAgICAgICAgICAgICAgYy5vYmoucGxheSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS5hdWRpby50b2dnbGVQYXVzZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkuYXVkaW9cbiAgICAgICAgICogQHNpZ24gcHVibGljIHRoaXMgQ3JhZnR5LmF1ZGlvLnRvZ2dsZVBhdXNlKHN0cmluZyBJRClcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gVGhlIGlkIG9mIHRoZSBhdWRpbyBvYmplY3QgdG8gcGF1c2UvXG4gICAgICAgICAqXG4gICAgICAgICAqIFRvZ2dsZSB0aGUgcGF1c2Ugc3RhdHVzIG9mIHRoZSBBdWRpbyBpbnN0YW5jZSBzcGVjaWZpZWQgYnkgaWQgcGFyYW0uXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkuYXVkaW8udG9nZ2xlUGF1c2UoJ211c2ljJyk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKlxuICAgICAgICAgKi9cbiAgICAgICAgdG9nZ2xlUGF1c2U6IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICAgICAgaWYgKCFDcmFmdHkuc3VwcG9ydC5hdWRpbyB8fCAhaWQgfHwgIXRoaXMuc291bmRzW2lkXSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB2YXIgYztcbiAgICAgICAgICAgIGZvciAodmFyIGkgaW4gdGhpcy5jaGFubmVscykge1xuICAgICAgICAgICAgICAgIGMgPSB0aGlzLmNoYW5uZWxzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChjLl9pcyhpZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGMub2JqLnBhdXNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYy5vYmoucGxheSgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYy5vYmoucGF1c2UoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pO1xuIiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG5DcmFmdHkuZXh0ZW5kKHtcblxuICAgIC8qKkBcbiAgICAgKiAjQ3JhZnR5LnNwcml0ZVxuICAgICAqIEBjYXRlZ29yeSBHcmFwaGljc1xuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIENyYWZ0eS5zcHJpdGUoW051bWJlciB0aWxlLCBbTnVtYmVyIHRpbGVoXV0sIFN0cmluZyB1cmwsIE9iamVjdCBtYXBbLCBOdW1iZXIgcGFkZGluZ1hbLCBOdW1iZXIgcGFkZGluZ1lbLCBCb29sZWFuIHBhZGRpbmdBcm91bmRCb3JkZXJdXV0pXG4gICAgICogQHBhcmFtIHRpbGUgLSBUaWxlIHNpemUgb2YgdGhlIHNwcml0ZSBtYXAsIGRlZmF1bHRzIHRvIDFcbiAgICAgKiBAcGFyYW0gdGlsZWggLSBIZWlnaHQgb2YgdGhlIHRpbGU7IGlmIHByb3ZpZGVkLCB0aWxlIGlzIGludGVycHJldGVkIGFzIHRoZSB3aWR0aFxuICAgICAqIEBwYXJhbSB1cmwgLSBVUkwgb2YgdGhlIHNwcml0ZSBpbWFnZVxuICAgICAqIEBwYXJhbSBtYXAgLSBPYmplY3Qgd2hlcmUgdGhlIGtleSBpcyB3aGF0IGJlY29tZXMgYSBuZXcgY29tcG9uZW50IGFuZCB0aGUgdmFsdWUgcG9pbnRzIHRvIGEgcG9zaXRpb24gb24gdGhlIHNwcml0ZSBtYXBcbiAgICAgKiBAcGFyYW0gcGFkZGluZ1ggLSBIb3Jpem9udGFsIHNwYWNlIGluIGJldHdlZW4gdGlsZXMuIERlZmF1bHRzIHRvIDAuXG4gICAgICogQHBhcmFtIHBhZGRpbmdZIC0gVmVydGljYWwgc3BhY2UgaW4gYmV0d2VlbiB0aWxlcy4gRGVmYXVsdHMgdG8gcGFkZGluZ1guXG4gICAgICogQHBhcmFtIHBhZGRpbmdBcm91bmRCb3JkZXIgLSBJZiBwYWRkaW5nIHNob3VsZCBiZSBhcHBsaWVkIGFyb3VuZCB0aGUgYm9yZGVyIG9mIHRoZSBzcHJpdGUgc2hlZXQuIElmIGVuYWJsZWQgdGhlIGZpcnN0IHRpbGUgc3RhcnRzIGF0IChwYWRkaW5nWCxwYWRkaW5nWSkgaW5zdGVhZCBvZiAoMCwwKS4gRGVmYXVsdHMgdG8gZmFsc2UuXG4gICAgICogR2VuZXJhdGVzIGNvbXBvbmVudHMgYmFzZWQgb24gcG9zaXRpb25zIGluIGEgc3ByaXRlIGltYWdlIHRvIGJlIGFwcGxpZWQgdG8gZW50aXRpZXMuXG4gICAgICpcbiAgICAgKiBBY2NlcHRzIGEgdGlsZSBzaXplLCBVUkwgYW5kIG1hcCBmb3IgdGhlIG5hbWUgb2YgdGhlIHNwcml0ZSBhbmQgaXRzIHBvc2l0aW9uLlxuICAgICAqXG4gICAgICogVGhlIHBvc2l0aW9uIG11c3QgYmUgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgcG9zaXRpb24gb2YgdGhlIHNwcml0ZSB3aGVyZSBpbmRleCBgMGBcbiAgICAgKiBpcyB0aGUgYHhgIHBvc2l0aW9uLCBgMWAgaXMgdGhlIGB5YCBwb3NpdGlvbiBhbmQgb3B0aW9uYWxseSBgMmAgaXMgdGhlIHdpZHRoIGFuZCBgM2BcbiAgICAgKiBpcyB0aGUgaGVpZ2h0LiBJZiB0aGUgc3ByaXRlIG1hcCBoYXMgcGFkZGluZywgcGFzcyB0aGUgdmFsdWVzIGZvciB0aGUgYHhgIHBhZGRpbmdcbiAgICAgKiBvciBgeWAgcGFkZGluZy4gSWYgdGhleSBhcmUgdGhlIHNhbWUsIGp1c3QgYWRkIG9uZSB2YWx1ZS5cbiAgICAgKlxuICAgICAqIElmIHRoZSBzcHJpdGUgaW1hZ2UgaGFzIG5vIGNvbnNpc3RlbnQgdGlsZSBzaXplLCBgMWAgb3Igbm8gYXJndW1lbnQgbmVlZCBiZVxuICAgICAqIHBhc3NlZCBmb3IgdGlsZSBzaXplLlxuICAgICAqXG4gICAgICogRW50aXRpZXMgdGhhdCBhZGQgdGhlIGdlbmVyYXRlZCBjb21wb25lbnRzIGFyZSBhbHNvIGdpdmVuIHRoZSBgMkRgIGNvbXBvbmVudCwgYW5kXG4gICAgICogYSBjb21wb25lbnQgY2FsbGVkIGBTcHJpdGVgLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuc3ByaXRlKFwiaW1ncy9zcHJpdGVtYXA2LnBuZ1wiLCB7Zmxvd2VyOlswLDAsMjAsMzBdfSk7XG4gICAgICogdmFyIGZsb3dlcl9lbnRpdHkgPSBDcmFmdHkuZShcIjJELCBET00sIGZsb3dlclwiKTtcbiAgICAgKiB+fn5cbiAgICAgKiBUaGUgZmlyc3QgbGluZSBjcmVhdGVzIGEgY29tcG9uZW50IGNhbGxlZCBgZmxvd2VyYCBhc3NvY2lhdGVkIHdpdGggdGhlIHN1Yi1pbWFnZSBvZlxuICAgICAqIHNwcml0ZW1hcDYucG5nIHdpdGggdG9wLWxlZnQgY29ybmVyICgwLDApLCB3aWR0aCAyMCBwaXhlbHMsIGFuZCBoZWlnaHQgMzAgcGl4ZWxzLlxuICAgICAqIFRoZSBzZWNvbmQgbGluZSBjcmVhdGVzIGFuIGVudGl0eSB3aXRoIHRoYXQgaW1hZ2UuIChOb3RlOiBUaGUgYDJEYCBpcyBub3QgcmVhbGx5XG4gICAgICogbmVjZXNzYXJ5IGhlcmUsIGJlY2F1c2UgYWRkaW5nIHRoZSBgZmxvd2VyYCBjb21wb25lbnQgYXV0b21hdGljYWxseSBhbHNvIGFkZHMgdGhlXG4gICAgICogYDJEYCBjb21wb25lbnQuKVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5zcHJpdGUoNTAsIFwiaW1ncy9zcHJpdGVtYXA2LnBuZ1wiLCB7Zmxvd2VyOlswLDBdLCBncmFzczpbMCwxLDMsMV19KTtcbiAgICAgKiB+fn5cbiAgICAgKiBJbiB0aGlzIGNhc2UsIHRoZSBgZmxvd2VyYCBjb21wb25lbnQgaXMgcGl4ZWxzIDAgPD0geCA8IDUwLCAwIDw9IHkgPCA1MCwgYW5kIHRoZVxuICAgICAqIGBncmFzc2AgY29tcG9uZW50IGlzIHBpeGVscyAwIDw9IHggPCAxNTAsIDUwIDw9IHkgPCAxMDAuIChUaGUgYDNgIG1lYW5zIGdyYXNzIGhhcyBhXG4gICAgICogd2lkdGggb2YgMyB0aWxlcywgaS5lLiAxNTAgcGl4ZWxzLilcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuc3ByaXRlKDUwLCAxMDAsIFwiaW1ncy9zcHJpdGVtYXA2LnBuZ1wiLCB7Zmxvd2VyOlswLDBdLCBncmFzczpbMCwxXX0sIDEwKTtcbiAgICAgKiB+fn5cbiAgICAgKiBJbiB0aGlzIGNhc2UsIGVhY2ggdGlsZSBpcyA1MHgxMDAsIGFuZCB0aGVyZSBpcyBhIHNwYWNpbmcgb2YgMTAgcGl4ZWxzIGJldHdlZW5cbiAgICAgKiBjb25zZWN1dGl2ZSB0aWxlcy4gU28gYGZsb3dlcmAgaXMgcGl4ZWxzIDAgPD0geCA8IDUwLCAwIDw9IHkgPCAxMDAsIGFuZCBgZ3Jhc3NgIGlzXG4gICAgICogcGl4ZWxzIDAgPD0geCA8IDUwLCAxMTAgPD0geSA8IDIxMC5cbiAgICAgKlxuICAgICAqIEBzZWUgU3ByaXRlXG4gICAgICovXG4gICAgc3ByaXRlOiBmdW5jdGlvbiAodGlsZSwgdGlsZWgsIHVybCwgbWFwLCBwYWRkaW5nWCwgcGFkZGluZ1ksIHBhZGRpbmdBcm91bmRCb3JkZXIpIHtcbiAgICAgICAgdmFyIHNwcml0ZU5hbWUsIHRlbXAsIHgsIHksIHcsIGgsIGltZztcblxuICAgICAgICAvL2lmIG5vIHRpbGUgdmFsdWUsIGRlZmF1bHQgdG8gMS5cbiAgICAgICAgLy8oaWYgdGhlIGZpcnN0IHBhc3NlZCBhcmd1bWVudCBpcyBhIHN0cmluZywgaXQgbXVzdCBiZSB0aGUgdXJsLilcbiAgICAgICAgaWYgKHR5cGVvZiB0aWxlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBwYWRkaW5nWSA9IHBhZGRpbmdYO1xuICAgICAgICAgICAgcGFkZGluZ1ggPSBtYXA7XG4gICAgICAgICAgICBtYXAgPSB0aWxlaDtcbiAgICAgICAgICAgIHVybCA9IHRpbGU7XG4gICAgICAgICAgICB0aWxlID0gMTtcbiAgICAgICAgICAgIHRpbGVoID0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgdGlsZWggPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcGFkZGluZ1kgPSBwYWRkaW5nWDtcbiAgICAgICAgICAgIHBhZGRpbmdYID0gbWFwO1xuICAgICAgICAgICAgbWFwID0gdXJsO1xuICAgICAgICAgICAgdXJsID0gdGlsZWg7XG4gICAgICAgICAgICB0aWxlaCA9IHRpbGU7XG4gICAgICAgIH1cblxuICAgICAgICAvL2lmIG5vIHBhZGRpbmdZLCB1c2UgcGFkZGluZ1hcbiAgICAgICAgaWYgKCFwYWRkaW5nWSAmJiBwYWRkaW5nWCkgcGFkZGluZ1kgPSBwYWRkaW5nWDtcbiAgICAgICAgcGFkZGluZ1ggPSBwYXJzZUludChwYWRkaW5nWCB8fCAwLCAxMCk7IC8vanVzdCBpbmNhc2VcbiAgICAgICAgcGFkZGluZ1kgPSBwYXJzZUludChwYWRkaW5nWSB8fCAwLCAxMCk7XG5cbiAgICAgICAgdmFyIG1hcmtTcHJpdGVzUmVhZHkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMucmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiSW52YWxpZGF0ZVwiKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpbWcgPSBDcmFmdHkuYXNzZXQodXJsKTtcbiAgICAgICAgaWYgKCFpbWcpIHtcbiAgICAgICAgICAgIGltZyA9IG5ldyBJbWFnZSgpO1xuICAgICAgICAgICAgaW1nLnNyYyA9IHVybDtcbiAgICAgICAgICAgIENyYWZ0eS5hc3NldCh1cmwsIGltZyk7XG4gICAgICAgICAgICBpbWcub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIC8vYWxsIGNvbXBvbmVudHMgd2l0aCB0aGlzIGltZyBhcmUgbm93IHJlYWR5XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgc3ByaXRlTmFtZSBpbiBtYXApIHtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5KHNwcml0ZU5hbWUpLmVhY2gobWFya1Nwcml0ZXNSZWFkeSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzaGFyZWRTcHJpdGVJbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLnJlcXVpcmVzKFwiMkQsIFNwcml0ZVwiKTtcbiAgICAgICAgICAgIHRoaXMuX190cmltID0gWzAsIDAsIDAsIDBdO1xuICAgICAgICAgICAgdGhpcy5fX2ltYWdlID0gdXJsO1xuICAgICAgICAgICAgdGhpcy5fX2Nvb3JkID0gW3RoaXMuX19jb29yZFswXSwgdGhpcy5fX2Nvb3JkWzFdLCB0aGlzLl9fY29vcmRbMl0sIHRoaXMuX19jb29yZFszXV07XG4gICAgICAgICAgICB0aGlzLl9fdGlsZSA9IHRpbGU7XG4gICAgICAgICAgICB0aGlzLl9fdGlsZWggPSB0aWxlaDtcbiAgICAgICAgICAgIHRoaXMuX19wYWRkaW5nID0gW3BhZGRpbmdYLCBwYWRkaW5nWV07XG4gICAgICAgICAgICB0aGlzLl9fcGFkQm9yZGVyID0gcGFkZGluZ0Fyb3VuZEJvcmRlcjtcbiAgICAgICAgICAgIHRoaXMuc3ByaXRlKHRoaXMuX19jb29yZFswXSwgdGhpcy5fX2Nvb3JkWzFdLCB0aGlzLl9fY29vcmRbMl0sIHRoaXMuX19jb29yZFszXSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMuaW1nID0gaW1nO1xuICAgICAgICAgICAgLy9kcmF3IG5vd1xuICAgICAgICAgICAgaWYgKHRoaXMuaW1nLmNvbXBsZXRlICYmIHRoaXMuaW1nLndpZHRoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIkludmFsaWRhdGVcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vc2V0IHRoZSB3aWR0aCBhbmQgaGVpZ2h0IHRvIHRoZSBzcHJpdGUgc2l6ZVxuICAgICAgICAgICAgdGhpcy53ID0gdGhpcy5fX2Nvb3JkWzJdO1xuICAgICAgICAgICAgdGhpcy5oID0gdGhpcy5fX2Nvb3JkWzNdO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZvciAoc3ByaXRlTmFtZSBpbiBtYXApIHtcbiAgICAgICAgICAgIGlmICghbWFwLmhhc093blByb3BlcnR5KHNwcml0ZU5hbWUpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgdGVtcCA9IG1hcFtzcHJpdGVOYW1lXTtcblxuICAgICAgICAgICAgLy9nZW5lcmF0ZXMgc3ByaXRlIGNvbXBvbmVudHMgZm9yIGVhY2ggdGlsZSBpbiB0aGUgbWFwXG4gICAgICAgICAgICBDcmFmdHkuYyhzcHJpdGVOYW1lLCB7XG4gICAgICAgICAgICAgICAgcmVhZHk6IGZhbHNlLFxuICAgICAgICAgICAgICAgIF9fY29vcmQ6IFt0ZW1wWzBdLCB0ZW1wWzFdLCB0ZW1wWzJdIHx8IDEsIHRlbXBbM10gfHwgMV0sXG5cbiAgICAgICAgICAgICAgICBpbml0OiBzaGFyZWRTcHJpdGVJbml0XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pO1xuXG4vKipAXG4gKiAjU3ByaXRlXG4gKiBAY2F0ZWdvcnkgR3JhcGhpY3NcbiAqIEB0cmlnZ2VyIEludmFsaWRhdGUgLSB3aGVuIHRoZSBzcHJpdGVzIGNoYW5nZVxuICogQ29tcG9uZW50IGZvciB1c2luZyB0aWxlcyBpbiBhIHNwcml0ZSBtYXAuXG4gKi9cbkNyYWZ0eS5jKFwiU3ByaXRlXCIsIHtcbiAgICBfX2ltYWdlOiAnJyxcbiAgICAvKlxuICAgICAqICMuX190aWxlXG4gICAgICogQGNvbXAgU3ByaXRlXG4gICAgICpcbiAgICAgKiBIb3Jpem9udGFsIHNwcml0ZSB0aWxlIHNpemUuXG4gICAgICovXG4gICAgX190aWxlOiAwLFxuICAgIC8qXG4gICAgICogIy5fX3RpbGVoXG4gICAgICogQGNvbXAgU3ByaXRlXG4gICAgICpcbiAgICAgKiBWZXJ0aWNhbCBzcHJpdGUgdGlsZSBzaXplLlxuICAgICAqL1xuICAgIF9fdGlsZWg6IDAsXG4gICAgX19wYWRkaW5nOiBudWxsLFxuICAgIF9fdHJpbTogbnVsbCxcbiAgICBpbWc6IG51bGwsXG4gICAgLy9yZWFkeSBpcyBjaGFuZ2VkIHRvIHRydWUgaW4gQ3JhZnR5LnNwcml0ZVxuICAgIHJlYWR5OiBmYWxzZSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fX3RyaW0gPSBbMCwgMCwgMCwgMF07XG5cbiAgICAgICAgdmFyIGRyYXcgPSBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgdmFyIGNvID0gZS5jbyxcbiAgICAgICAgICAgICAgICBwb3MgPSBlLnBvcyxcbiAgICAgICAgICAgICAgICBjb250ZXh0ID0gZS5jdHg7XG5cbiAgICAgICAgICAgIGlmIChlLnR5cGUgPT09IFwiY2FudmFzXCIpIHtcbiAgICAgICAgICAgICAgICAvL2RyYXcgdGhlIGltYWdlIG9uIHRoZSBjYW52YXMgZWxlbWVudFxuICAgICAgICAgICAgICAgIGNvbnRleHQuZHJhd0ltYWdlKHRoaXMuaW1nLCAvL2ltYWdlIGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgY28ueCwgLy94IHBvc2l0aW9uIG9uIHNwcml0ZVxuICAgICAgICAgICAgICAgICAgICBjby55LCAvL3kgcG9zaXRpb24gb24gc3ByaXRlXG4gICAgICAgICAgICAgICAgICAgIGNvLncsIC8vd2lkdGggb24gc3ByaXRlXG4gICAgICAgICAgICAgICAgICAgIGNvLmgsIC8vaGVpZ2h0IG9uIHNwcml0ZVxuICAgICAgICAgICAgICAgICAgICBwb3MuX3gsIC8veCBwb3NpdGlvbiBvbiBjYW52YXNcbiAgICAgICAgICAgICAgICAgICAgcG9zLl95LCAvL3kgcG9zaXRpb24gb24gY2FudmFzXG4gICAgICAgICAgICAgICAgICAgIHBvcy5fdywgLy93aWR0aCBvbiBjYW52YXNcbiAgICAgICAgICAgICAgICAgICAgcG9zLl9oIC8vaGVpZ2h0IG9uIGNhbnZhc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gXCJET01cIikge1xuICAgICAgICAgICAgICAgIC8vIEdldCBzY2FsZSAocmF0aW8gb2YgZW50aXR5IGRpbWVuc2lvbnMgdG8gc3ByaXRlJ3MgZGltZW5zaW9ucylcbiAgICAgICAgICAgICAgICAvLyBJZiBuZWVkZWQsIHdlIHdpbGwgc2NhbGUgdXAgdGhlIGVudGlyZSBzcHJpdGUgc2hlZXQsIGFuZCB0aGVuIG1vZGlmeSB0aGUgcG9zaXRpb24gYWNjb3JkaW5nbHlcbiAgICAgICAgICAgICAgICB2YXIgdnNjYWxlID0gdGhpcy5faCAvIGNvLmgsXG4gICAgICAgICAgICAgICAgICAgIGhzY2FsZSA9IHRoaXMuX3cgLyBjby53LFxuICAgICAgICAgICAgICAgICAgICBzdHlsZSA9IHRoaXMuX2VsZW1lbnQuc3R5bGU7XG5cbiAgICAgICAgICAgICAgICBzdHlsZS5iYWNrZ3JvdW5kID0gc3R5bGUuYmFja2dyb3VuZENvbG9yICsgXCIgdXJsKCdcIiArIHRoaXMuX19pbWFnZSArIFwiJykgbm8tcmVwZWF0XCI7XG4gICAgICAgICAgICAgICAgc3R5bGUuYmFja2dyb3VuZFBvc2l0aW9uID0gXCItXCIgKyBjby54ICogaHNjYWxlICsgXCJweCAtXCIgKyBjby55ICogdnNjYWxlICsgXCJweFwiO1xuICAgICAgICAgICAgICAgIC8vIHN0eWxlLmJhY2tncm91bmRTaXplIG11c3QgYmUgc2V0IEFGVEVSIHN0eWxlLmJhY2tncm91bmQhXG4gICAgICAgICAgICAgICAgaWYgKHZzY2FsZSAhPSAxIHx8IGhzY2FsZSAhPSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0eWxlLmJhY2tncm91bmRTaXplID0gKHRoaXMuaW1nLndpZHRoICogaHNjYWxlKSArIFwicHhcIiArIFwiIFwiICsgKHRoaXMuaW1nLmhlaWdodCAqIHZzY2FsZSkgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuYmluZChcIkRyYXdcIiwgZHJhdykuYmluZChcIlJlbW92ZUNvbXBvbmVudFwiLCBmdW5jdGlvbiAoaWQpIHtcbiAgICAgICAgICAgIGlmIChpZCA9PT0gXCJTcHJpdGVcIikgdGhpcy51bmJpbmQoXCJEcmF3XCIsIGRyYXcpO1xuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMuc3ByaXRlXG4gICAgICogQGNvbXAgU3ByaXRlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnNwcml0ZShOdW1iZXIgeCwgTnVtYmVyIHlbLCBOdW1iZXIgdywgTnVtYmVyIGhdKVxuICAgICAqIEBwYXJhbSB4IC0gWCBjZWxsIHBvc2l0aW9uXG4gICAgICogQHBhcmFtIHkgLSBZIGNlbGwgcG9zaXRpb25cbiAgICAgKiBAcGFyYW0gdyAtIFdpZHRoIGluIGNlbGxzLiBPcHRpb25hbC5cbiAgICAgKiBAcGFyYW0gaCAtIEhlaWdodCBpbiBjZWxscy4gT3B0aW9uYWwuXG4gICAgICpcbiAgICAgKiBVc2VzIGEgbmV3IGxvY2F0aW9uIG9uIHRoZSBzcHJpdGUgbWFwIGFzIGl0cyBzcHJpdGUuIElmIHcgb3IgaCBhcmUgb21taXR0ZWQsIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IGFyZSBub3QgY2hhbmdlZC5cbiAgICAgKlxuICAgICAqIFZhbHVlcyBzaG91bGQgYmUgaW4gdGlsZXMgb3IgY2VsbHMgKG5vdCBwaXhlbHMpLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIjJELCBET00sIFNwcml0ZVwiKVxuICAgICAqICAgLnNwcml0ZSgwLCAwLCAyLCAyKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cblxuICAgIC8qKkBcbiAgICAgKiAjLl9fY29vcmRcbiAgICAgKiBAY29tcCBTcHJpdGVcbiAgICAgKlxuICAgICAqIFRoZSBjb29yZGluYXRlIG9mIHRoZSBzbGlkZSB3aXRoaW4gdGhlIHNwcml0ZSBpbiB0aGUgZm9ybWF0IG9mIFt4LCB5LCB3LCBoXS5cbiAgICAgKi9cbiAgICBzcHJpdGU6IGZ1bmN0aW9uICh4LCB5LCB3LCBoKSB7XG4gICAgICAgIHRoaXMuX19jb29yZCA9IHRoaXMuX19jb29yZCB8fCBbMCwgMCwgMCwgMF07XG5cbiAgICAgICAgdGhpcy5fX2Nvb3JkWzBdID0geCAqICh0aGlzLl9fdGlsZSArIHRoaXMuX19wYWRkaW5nWzBdKSArICh0aGlzLl9fcGFkQm9yZGVyID8gdGhpcy5fX3BhZGRpbmdbMF0gOiAwKSArIHRoaXMuX190cmltWzBdO1xuICAgICAgICB0aGlzLl9fY29vcmRbMV0gPSB5ICogKHRoaXMuX190aWxlaCArIHRoaXMuX19wYWRkaW5nWzFdKSArICh0aGlzLl9fcGFkQm9yZGVyID8gdGhpcy5fX3BhZGRpbmdbMV0gOiAwKSArIHRoaXMuX190cmltWzFdO1xuICAgICAgICBpZiAodHlwZW9mKHcpIT09J3VuZGVmaW5lZCcgJiYgdHlwZW9mKGgpIT09J3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRoaXMuX19jb29yZFsyXSA9IHRoaXMuX190cmltWzJdIHx8IHcgKiB0aGlzLl9fdGlsZSB8fCB0aGlzLl9fdGlsZTtcbiAgICAgICAgICAgIHRoaXMuX19jb29yZFszXSA9IHRoaXMuX190cmltWzNdIHx8IGggKiB0aGlzLl9fdGlsZWggfHwgdGhpcy5fX3RpbGVoO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy50cmlnZ2VyKFwiSW52YWxpZGF0ZVwiKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8qKkBcbiAgICAgKiAjLmNyb3BcbiAgICAgKiBAY29tcCBTcHJpdGVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAuY3JvcChOdW1iZXIgeCwgTnVtYmVyIHksIE51bWJlciB3LCBOdW1iZXIgaClcbiAgICAgKiBAcGFyYW0geCAtIE9mZnNldCB4IHBvc2l0aW9uXG4gICAgICogQHBhcmFtIHkgLSBPZmZzZXQgeSBwb3NpdGlvblxuICAgICAqIEBwYXJhbSB3IC0gTmV3IHdpZHRoXG4gICAgICogQHBhcmFtIGggLSBOZXcgaGVpZ2h0XG4gICAgICpcbiAgICAgKiBJZiB0aGUgZW50aXR5IG5lZWRzIHRvIGJlIHNtYWxsZXIgdGhhbiB0aGUgdGlsZSBzaXplLCB1c2UgdGhpcyBtZXRob2QgdG8gY3JvcCBpdC5cbiAgICAgKlxuICAgICAqIFRoZSB2YWx1ZXMgc2hvdWxkIGJlIGluIHBpeGVscyByYXRoZXIgdGhhbiB0aWxlcy5cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogfn5+XG4gICAgICogQ3JhZnR5LmUoXCIyRCwgRE9NLCBTcHJpdGVcIilcbiAgICAgKiAgIC5jcm9wKDQwLCA0MCwgMjIsIDIzKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBjcm9wOiBmdW5jdGlvbiAoeCwgeSwgdywgaCkge1xuICAgICAgICB2YXIgb2xkID0gdGhpcy5fbWJyIHx8IHRoaXMucG9zKCk7XG4gICAgICAgIHRoaXMuX190cmltID0gW107XG4gICAgICAgIHRoaXMuX190cmltWzBdID0geDtcbiAgICAgICAgdGhpcy5fX3RyaW1bMV0gPSB5O1xuICAgICAgICB0aGlzLl9fdHJpbVsyXSA9IHc7XG4gICAgICAgIHRoaXMuX190cmltWzNdID0gaDtcblxuICAgICAgICB0aGlzLl9fY29vcmRbMF0gKz0geDtcbiAgICAgICAgdGhpcy5fX2Nvb3JkWzFdICs9IHk7XG4gICAgICAgIHRoaXMuX19jb29yZFsyXSA9IHc7XG4gICAgICAgIHRoaXMuX19jb29yZFszXSA9IGg7XG4gICAgICAgIHRoaXMuX3cgPSB3O1xuICAgICAgICB0aGlzLl9oID0gaDtcblxuICAgICAgICB0aGlzLnRyaWdnZXIoXCJJbnZhbGlkYXRlXCIsIG9sZCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pOyIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuLyoqQFxuICogI1N0b3JhZ2VcbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIFZlcnkgc2ltcGxlIHdheSB0byBnZXQgYW5kIHNldCB2YWx1ZXMsIHdoaWNoIHdpbGwgcGVyc2lzdCB3aGVuIHRoZSBicm93c2VyIGlzIGNsb3NlZCBhbHNvLlxuICovXG4vKipAXG4gKiAjLnN0b3JhZ2VcbiAqIEBjb21wIFN0b3JhZ2VcbiAqIEBzaWduIC5zdG9yYWdlKFN0cmluZyBrZXkpXG4gKiBAcGFyYW0ga2V5IC0gYSBrZXkgeW91IHdvdWxkIGxpa2UgdG8gZ2V0IGZyb20gdGhlIHN0b3JhZ2UuIEl0IHdpbGwgcmV0dXJuIG51bGwgaWYgdGhlIGtleSBkb2VzIG5vdCBleGlzdHMuXG4gKiBAc2lnbiAuc3RvcmFnZShTdHJpbmcga2V5LCBTdHJpbmcgdmFsdWUpXG4gKiBAcGFyYW0ga2V5IC0gdGhlIGtleSB5b3Ugd291bGQgbGlrZSB0byBzYXZlIHRoZSBkYXRhIHVuZGVyLlxuICogQHBhcmFtIHZhbHVlIC0gdGhlIHZhbHVlIHlvdSB3b3VsZCBsaWtlIHRvIHNhdmUuXG4gKiBAc2lnbiAuc3RvcmFnZShTdHJpbmcga2V5LCBbT2JqZWN0IHZhbHVlLCBBcnJheSB2YWx1ZSwgQm9vbGVhbiB2YWx1ZV0pXG4gKiBAcGFyYW0ga2V5IC0gdGhlIGtleSB5b3Ugd291bGQgbGlrZSB0byBzYXZlIHRoZSBkYXRhIHVuZGVyLlxuICogQHBhcmFtIHZhbHVlIC0gdGhlIHZhbHVlIHlvdSB3b3VsZCBsaWtlIHRvIHNhdmUsIGNhbiBiZSBhbiBPYmplY3Qgb3IgYW4gQXJyYXkuXG4gKlxuICogU3RvcmFnZSBmdW5jdGlvbiBpcyB2ZXJ5IHNpbXBsZSBhbmQgY2FuIGJlIHVzZWQgdG8gZWl0aGVyIGdldCBvciBzZXQgdmFsdWVzLiBcbiAqIFlvdSBjYW4gc3RvcmUgYm90aCBib29sZWFucywgc3RyaW5ncywgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICpcbiAqIFBsZWFzZSBub3RlOiBZb3Ugc2hvdWxkIG5vdCBzdG9yZSBkYXRhLCB3aGlsZSB0aGUgZ2FtZSBpcyBwbGF5aW5nLCBhcyBpdCBjYW4gY2F1c2UgdGhlIGdhbWUgdG8gc2xvdyBkb3duLiBZb3Ugc2hvdWxkIGxvYWQgZGF0YSB3aGVuIHlvdSBzdGFydCB0aGUgZ2FtZSwgb3Igd2hlbiB0aGUgdXNlciBmb3IgYW4gZXhhbXBsZSBjbGljayBhIFwiU2F2ZSBnYW1lcHJvY2Vzc1wiIGJ1dHRvbi5cbiAqXG4gKiBAZXhhbXBsZVxuICogR2V0IGFuIGFscmVhZHkgc3RvcmVkIHZhbHVlXG4gKiB+fn5cbiAqIHZhciBwbGF5ZXJuYW1lID0gQ3JhZnR5LnN0b3JhZ2UoJ3BsYXllcm5hbWUnKTtcbiAqIH5+flxuICpcbiAqIEBleGFtcGxlXG4gKiBTYXZlIGEgdmFsdWVcbiAqIH5+flxuICogQ3JhZnR5LnN0b3JhZ2UoJ3BsYXllcm5hbWUnLCAnSGVybycpO1xuICogfn5+XG4gKlxuICogQGV4YW1wbGVcbiAqIFRlc3QgdG8gc2VlIGlmIGEgdmFsdWUgaXMgYWxyZWFkeSB0aGVyZS5cbiAqIH5+flxuICogdmFyIGhlcm9uYW1lID0gQ3JhZnR5LnN0b3JhZ2UoJ25hbWUnKTtcbiAqIGlmKCFoZXJvbmFtZSl7XG4gKiAgIC8vIE1heWJlIGFzayB0aGUgcGxheWVyIHdoYXQgdGhlaXIgbmFtZSBpcyBoZXJlXG4gKiAgIGhlcm9uYW1lID0gJ0d1ZXN0JztcbiAqIH1cbiAqIC8vIERvIHNvbWV0aGluZyB3aXRoIGhlcm9uYW1lXG4gKiB+fn5cbiAqL1xuXG5DcmFmdHkuc3RvcmFnZSA9IGZ1bmN0aW9uKGtleSwgdmFsdWUpe1xuICB2YXIgc3RvcmFnZSA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UsXG4gICAgICBfdmFsdWUgPSB2YWx1ZTtcblxuICBpZighc3RvcmFnZSl7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gSlNPTi5wYXJzZShzdG9yYWdlLmdldEl0ZW0oa2V5KSk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gc3RvcmFnZS5nZXRJdGVtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgX3ZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgIH1cblxuICAgIHN0b3JhZ2Uuc2V0SXRlbShrZXksIF92YWx1ZSk7XG4gICAgXG4gIH1cblxufTtcbi8qKkBcbiAqICMuc3RvcmFnZS5yZW1vdmVcbiAqIEBjb21wIFN0b3JhZ2VcbiAqIEBzaWduIC5zdG9yYWdlLnJlbW92ZShTdHJpbmcga2V5KVxuICogQHBhcmFtIGtleSAtIGEga2V5IHdoZXJlIHlvdSB3aWxsIGxpa2UgdG8gZGVsZXRlIHRoZSB2YWx1ZSBvZi5cbiAqXG4gKiBHZW5lcmFsbHkgeW91IGRvIG5vdCBuZWVkIHRvIHJlbW92ZSB2YWx1ZXMgZnJvbSBsb2NhbFN0b3JhZ2UsIGJ1dCBpZiB5b3UgZG9cbiAqIHN0b3JlIGxhcmdlIGFtb3VudCBvZiB0ZXh0LCBvciB3YW50IHRvIHVuc2V0IHNvbWV0aGluZyB5b3UgY2FuIGRvIHRoYXQgd2l0aFxuICogdGhpcyBmdW5jdGlvbi5cbiAqXG4gKiBAZXhhbXBsZVxuICogR2V0IGFuIGFscmVhZHkgc3RvcmVkIHZhbHVlXG4gKiB+fn5cbiAqIENyYWZ0eS5zdG9yYWdlLnJlbW92ZSgncGxheWVybmFtZScpO1xuICogfn5+XG4gKlxuICovXG5DcmFmdHkuc3RvcmFnZS5yZW1vdmUgPSBmdW5jdGlvbihrZXkpe1xuICB3aW5kb3cubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbn07IiwidmFyIENyYWZ0eSA9IHJlcXVpcmUoJy4vY29yZS5qcycpLFxuICAgIGRvY3VtZW50ID0gd2luZG93LmRvY3VtZW50O1xuXG4vKipAXG4gKiAjVGV4dFxuICogQGNhdGVnb3J5IEdyYXBoaWNzXG4gKiBAdHJpZ2dlciBJbnZhbGlkYXRlIC0gd2hlbiB0aGUgdGV4dCBpcyBjaGFuZ2VkXG4gKiBAcmVxdWlyZXMgQ2FudmFzIG9yIERPTVxuICogQ29tcG9uZW50IHRvIG1ha2UgYSB0ZXh0IGVudGl0eS5cbiAqXG4gKiBCeSBkZWZhdWx0LCB0ZXh0IHdpbGwgaGF2ZSB0aGUgc3R5bGUgXCIxMHB4IHNhbnMtc2VyaWZcIi5cbiAqXG4gKiBOb3RlIDE6IEFuIGVudGl0eSB3aXRoIHRoZSB0ZXh0IGNvbXBvbmVudCBpcyBqdXN0IHRleHQhIElmIHlvdSB3YW50IHRvIHdyaXRlIHRleHRcbiAqIGluc2lkZSBhbiBpbWFnZSwgeW91IG5lZWQgb25lIGVudGl0eSBmb3IgdGhlIHRleHQgYW5kIGFub3RoZXIgZW50aXR5IGZvciB0aGUgaW1hZ2UuXG4gKiBNb3JlIHRpcHMgZm9yIHdyaXRpbmcgdGV4dCBpbnNpZGUgYW4gaW1hZ2U6ICgxKSBVc2UgdGhlIHotaW5kZXggKGZyb20gMkQgY29tcG9uZW50KVxuICogdG8gZW5zdXJlIHRoYXQgdGhlIHRleHQgaXMgb24gdG9wIG9mIHRoZSBpbWFnZSwgbm90IHRoZSBvdGhlciB3YXkgYXJvdW5kOyAoMilcbiAqIHVzZSAuYXR0YWNoKCkgKGZyb20gMkQgY29tcG9uZW50KSB0byBnbHVlIHRoZSB0ZXh0IHRvIHRoZSBpbWFnZSBzbyB0aGV5IG1vdmUgYW5kXG4gKiByb3RhdGUgdG9nZXRoZXIuXG4gKlxuICogTm90ZSAyOiBGb3IgRE9NIChidXQgbm90IGNhbnZhcykgdGV4dCBlbnRpdGllcywgdmFyaW91cyBmb250IHNldHRpbmdzIChsaWtlXG4gKiB0ZXh0LWRlY29yYXRpb24gYW5kIHRleHQtYWxpZ24pIGNhbiBiZSBzZXQgdXNpbmcgYC5jc3MoKWAgKHNlZSBET00gY29tcG9uZW50KS4gQnV0XG4gKiB5b3UgY2Fubm90IHVzZSBgLmNzcygpYCB0byBzZXQgdGhlIHByb3BlcnRpZXMgd2hpY2ggYXJlIGNvbnRyb2xsZWQgYnkgYC50ZXh0Rm9udCgpYFxuICogb3IgYC50ZXh0Q29sb3IoKWAgLS0gdGhlIHNldHRpbmdzIHdpbGwgYmUgaWdub3JlZC5cbiAqXG4gKiBOb3RlIDM6IElmIHlvdSB1c2UgY2FudmFzIHRleHQgd2l0aCBnbHlwaHMgdGhhdCBhcmUgdGFsbGVyIHRoYW4gc3RhbmRhcmQgbGV0dGVycywgcG9ydGlvbnMgb2YgdGhlIGdseXBocyBtaWdodCBiZSBjdXQgb2ZmLlxuICovXG5DcmFmdHkuYyhcIlRleHRcIiwge1xuICAgIF90ZXh0OiBcIlwiLFxuICAgIGRlZmF1bHRTaXplOiBcIjEwcHhcIixcbiAgICBkZWZhdWx0RmFtaWx5OiBcInNhbnMtc2VyaWZcIixcbiAgICBkZWZhdWx0VmFyaWFudDogXCJub3JtYWxcIixcbiAgICBkZWZhdWx0TGluZUhlaWdodDogXCJub3JtYWxcIixcbiAgICByZWFkeTogdHJ1ZSxcblxuICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZXF1aXJlcyhcIjJEXCIpO1xuICAgICAgICB0aGlzLl90ZXh0Rm9udCA9IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIlwiLFxuICAgICAgICAgICAgXCJ3ZWlnaHRcIjogXCJcIixcbiAgICAgICAgICAgIFwic2l6ZVwiOiB0aGlzLmRlZmF1bHRTaXplLFxuICAgICAgICAgICAgXCJsaW5lSGVpZ2h0XCI6dGhpcy5kZWZhdWx0TGluZUhlaWdodCxcbiAgICAgICAgICAgIFwiZmFtaWx5XCI6IHRoaXMuZGVmYXVsdEZhbWlseSxcbiAgICAgICAgICAgIFwidmFyaWFudFwiOiB0aGlzLmRlZmF1bHRWYXJpYW50XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5iaW5kKFwiRHJhd1wiLCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgdmFyIGZvbnQgPSB0aGlzLl9mb250U3RyaW5nKCk7XG5cbiAgICAgICAgICAgIGlmIChlLnR5cGUgPT09IFwiRE9NXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZWwgPSB0aGlzLl9lbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICBzdHlsZSA9IGVsLnN0eWxlO1xuXG4gICAgICAgICAgICAgICAgc3R5bGUuY29sb3IgPSB0aGlzLl90ZXh0Q29sb3I7XG4gICAgICAgICAgICAgICAgc3R5bGUuZm9udCA9IGZvbnQ7XG4gICAgICAgICAgICAgICAgZWwuaW5uZXJIVE1MID0gdGhpcy5fdGV4dDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZS50eXBlID09PSBcImNhbnZhc1wiKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRleHQgPSBlLmN0eDtcblxuICAgICAgICAgICAgICAgIGNvbnRleHQuc2F2ZSgpO1xuXG4gICAgICAgICAgICAgICAgY29udGV4dC50ZXh0QmFzZWxpbmUgPSBcInRvcFwiO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gdGhpcy5fdGV4dENvbG9yIHx8IFwicmdiKDAsMCwwKVwiO1xuICAgICAgICAgICAgICAgIGNvbnRleHQuZm9udCA9IGZvbnQ7XG5cbiAgICAgICAgICAgICAgICBjb250ZXh0LmZpbGxUZXh0KHRoaXMuX3RleHQsIHRoaXMuX3gsIHRoaXMuX3kpO1xuXG4gICAgICAgICAgICAgICAgY29udGV4dC5yZXN0b3JlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvLyB0YWtlcyBhIENTUyBmb250LXNpemUgc3RyaW5nIGFuZCBnZXRzIHRoZSBoZWlnaHQgb2YgdGhlIHJlc3VsdGluZyBmb250IGluIHB4XG4gICAgX2dldEZvbnRIZWlnaHQ6IChmdW5jdGlvbigpe1xuICAgICAgICAvLyByZWdleCBmb3IgZ3JhYmJpbmcgdGhlIGZpcnN0IHN0cmluZyBvZiBsZXR0ZXJzXG4gICAgICAgIHZhciByZSA9IC8oW2EtekEtWl0rKVxcYi87XG4gICAgICAgIC8vIEZyb20gdGhlIENTUyBzcGVjLiAgXCJlbVwiIGFuZCBcImV4XCIgYXJlIHVuZGVmaW5lZCBvbiBhIGNhbnZhcy5cbiAgICAgICAgdmFyIG11bHRpcGxpZXJzID0ge1xuICAgICAgICAgICAgXCJweFwiOiAxLFxuICAgICAgICAgICAgXCJwdFwiOiA0LzMsXG4gICAgICAgICAgICBcInBjXCI6IDE2LFxuICAgICAgICAgICAgXCJjbVwiOiA5Ni8yLjU0LFxuICAgICAgICAgICAgXCJtbVwiOiA5Ni8yNS40LFxuICAgICAgICAgICAgXCJpblwiOiA5NixcbiAgICAgICAgICAgIFwiZW1cIjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgXCJleFwiOiB1bmRlZmluZWRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmb250KXtcbiAgICAgICAgICAgIHZhciBudW1iZXIgPSBwYXJzZUZsb2F0KGZvbnQpO1xuICAgICAgICAgICAgdmFyIG1hdGNoID0gcmUuZXhlYyhmb250KTtcbiAgICAgICAgICAgIHZhciB1bml0ID0gIG1hdGNoID8gbWF0Y2hbMV0gOiBcInB4XCI7XG4gICAgICAgICAgICBpZiAobXVsdGlwbGllcnNbdW5pdF0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5jZWlsKG51bWJlciAqIG11bHRpcGxpZXJzW3VuaXRdKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm4gTWF0aC5jZWlsKG51bWJlcik7XG4gICAgICAgIH07XG4gICAgfSkoKSxcblxuICAgIC8qKkBcbiAgICAgKiAjLnRleHRcbiAgICAgKiBAY29tcCBUZXh0XG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnRleHQoU3RyaW5nIHRleHQpXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnRleHQoRnVuY3Rpb24gdGV4dGdlbmVyYXRvcilcbiAgICAgKiBAcGFyYW0gdGV4dCAtIFN0cmluZyBvZiB0ZXh0IHRoYXQgd2lsbCBiZSBpbnNlcnRlZCBpbnRvIHRoZSBET00gb3IgQ2FudmFzIGVsZW1lbnQuXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCB3aWxsIHVwZGF0ZSB0aGUgdGV4dCBpbnNpZGUgdGhlIGVudGl0eS5cbiAgICAgKlxuICAgICAqIElmIHlvdSBuZWVkIHRvIHJlZmVyZW5jZSBhdHRyaWJ1dGVzIG9uIHRoZSBlbnRpdHkgaXRzZWxmIHlvdSBjYW4gcGFzcyBhIGZ1bmN0aW9uIGluc3RlYWQgb2YgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiMkQsIERPTSwgVGV4dFwiKS5hdHRyKHsgeDogMTAwLCB5OiAxMDAgfSkudGV4dChcIkxvb2sgYXQgbWUhIVwiKTtcbiAgICAgKlxuICAgICAqIENyYWZ0eS5lKFwiMkQsIERPTSwgVGV4dFwiKS5hdHRyKHsgeDogMTAwLCB5OiAxMDAgfSlcbiAgICAgKiAgICAgLnRleHQoZnVuY3Rpb24gKCkgeyByZXR1cm4gXCJNeSBwb3NpdGlvbiBpcyBcIiArIHRoaXMuX3ggfSk7XG4gICAgICpcbiAgICAgKiBDcmFmdHkuZShcIjJELCBDYW52YXMsIFRleHRcIikuYXR0cih7IHg6IDEwMCwgeTogMTAwIH0pLnRleHQoXCJMb29rIGF0IG1lISFcIik7XG4gICAgICpcbiAgICAgKiBDcmFmdHkuZShcIjJELCBDYW52YXMsIFRleHRcIikuYXR0cih7IHg6IDEwMCwgeTogMTAwIH0pXG4gICAgICogICAgIC50ZXh0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIFwiTXkgcG9zaXRpb24gaXMgXCIgKyB0aGlzLl94IH0pO1xuICAgICAqIH5+flxuICAgICAqL1xuICAgIHRleHQ6IGZ1bmN0aW9uICh0ZXh0KSB7XG4gICAgICAgIGlmICghKHR5cGVvZiB0ZXh0ICE9PSBcInVuZGVmaW5lZFwiICYmIHRleHQgIT09IG51bGwpKSByZXR1cm4gdGhpcy5fdGV4dDtcbiAgICAgICAgaWYgKHR5cGVvZiAodGV4dCkgPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgdGhpcy5fdGV4dCA9IHRleHQuY2FsbCh0aGlzKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy5fdGV4dCA9IHRleHQ7XG5cbiAgICAgICAgaWYgKHRoaXMuaGFzKFwiQ2FudmFzXCIpIClcbiAgICAgICAgICAgIHRoaXMuX3Jlc2l6ZUZvckNhbnZhcygpO1xuXG4gICAgICAgIHRoaXMudHJpZ2dlcihcIkludmFsaWRhdGVcIik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvLyBDYWxjdWxhdGVzIHRoZSBoZWlnaHQgYW5kIHdpZHRoIG9mIHRleHQgb24gdGhlIGNhbnZhc1xuICAgIC8vIFdpZHRoIGlzIGZvdW5kIGJ5IHVzaW5nIHRoZSBjYW52YXMgbWVhc3VyZVRleHQgZnVuY3Rpb25cbiAgICAvLyBIZWlnaHQgaXMgb25seSBlc3RpbWF0ZWQgLS0gaXQgY2FsY3VsYXRlcyB0aGUgZm9udCBzaXplIGluIHBpeGVscywgYW5kIHNldHMgdGhlIGhlaWdodCB0byAxMTAlIG9mIHRoYXQuXG4gICAgX3Jlc2l6ZUZvckNhbnZhczogZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIGN0eCA9IENyYWZ0eS5jYW52YXMuY29udGV4dDtcbiAgICAgICAgY3R4LmZvbnQgPSB0aGlzLl9mb250U3RyaW5nKCk7XG4gICAgICAgIHRoaXMudyA9IGN0eC5tZWFzdXJlVGV4dCh0aGlzLl90ZXh0KS53aWR0aDtcblxuICAgICAgICB2YXIgc2l6ZSA9ICh0aGlzLl90ZXh0Rm9udC5zaXplIHx8IHRoaXMuZGVmYXVsdFNpemUpO1xuICAgICAgICB0aGlzLmggPSAxLjEgKiB0aGlzLl9nZXRGb250SGVpZ2h0KHNpemUpO1xuICAgIH0sXG5cbiAgICAvLyBSZXR1cm5zIHRoZSBmb250IHN0cmluZyB0byB1c2VcbiAgICBfZm9udFN0cmluZzogZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3RleHRGb250LnR5cGUgKyAnICcgKyB0aGlzLl90ZXh0Rm9udC52YXJpYW50ICArICcgJyArIHRoaXMuX3RleHRGb250LndlaWdodCArICcgJyArIHRoaXMuX3RleHRGb250LnNpemUgICsgJyAvICcgKyB0aGlzLl90ZXh0Rm9udC5saW5lSGVpZ2h0ICsgJyAnICsgdGhpcy5fdGV4dEZvbnQuZmFtaWx5O1xuICAgIH0sXG4gICAgLyoqQFxuICAgICAqICMudGV4dENvbG9yXG4gICAgICogQGNvbXAgVGV4dFxuICAgICAqIEBzaWduIHB1YmxpYyB0aGlzIC50ZXh0Q29sb3IoU3RyaW5nIGNvbG9yLCBOdW1iZXIgc3RyZW5ndGgpXG4gICAgICogQHBhcmFtIGNvbG9yIC0gVGhlIGNvbG9yIGluIGhleGFkZWNpbWFsXG4gICAgICogQHBhcmFtIHN0cmVuZ3RoIC0gTGV2ZWwgb2Ygb3BhY2l0eVxuICAgICAqXG4gICAgICogTW9kaWZ5IHRoZSB0ZXh0IGNvbG9yIGFuZCBsZXZlbCBvZiBvcGFjaXR5LlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIjJELCBET00sIFRleHRcIikuYXR0cih7IHg6IDEwMCwgeTogMTAwIH0pLnRleHQoXCJMb29rIGF0IG1lISFcIilcbiAgICAgKiAgIC50ZXh0Q29sb3IoJyNGRjAwMDAnKTtcbiAgICAgKlxuICAgICAqIENyYWZ0eS5lKFwiMkQsIENhbnZhcywgVGV4dFwiKS5hdHRyKHsgeDogMTAwLCB5OiAxMDAgfSkudGV4dCgnTG9vayBhdCBtZSEhJylcbiAgICAgKiAgIC50ZXh0Q29sb3IoJyNGRjAwMDAnLCAwLjYpO1xuICAgICAqIH5+flxuICAgICAqIEBzZWUgQ3JhZnR5LnRvUkdCXG4gICAgICovXG4gICAgdGV4dENvbG9yOiBmdW5jdGlvbiAoY29sb3IsIHN0cmVuZ3RoKSB7XG4gICAgICAgIHRoaXMuX3N0cmVuZ3RoID0gc3RyZW5ndGg7XG4gICAgICAgIHRoaXMuX3RleHRDb2xvciA9IENyYWZ0eS50b1JHQihjb2xvciwgdGhpcy5fc3RyZW5ndGgpO1xuICAgICAgICB0aGlzLnRyaWdnZXIoXCJJbnZhbGlkYXRlXCIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLyoqQFxuICAgICAqICMudGV4dEZvbnRcbiAgICAgKiBAY29tcCBUZXh0XG4gICAgICogQHRyaWdnZXJzIEludmFsaWRhdGVcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAudGV4dEZvbnQoU3RyaW5nIGtleSwgKiB2YWx1ZSlcbiAgICAgKiBAcGFyYW0ga2V5IC0gUHJvcGVydHkgb2YgdGhlIGVudGl0eSB0byBtb2RpZnlcbiAgICAgKiBAcGFyYW0gdmFsdWUgLSBWYWx1ZSB0byBzZXQgdGhlIHByb3BlcnR5IHRvXG4gICAgICpcbiAgICAgKiBAc2lnbiBwdWJsaWMgdGhpcyAudGV4dEZvbnQoT2JqZWN0IG1hcClcbiAgICAgKiBAcGFyYW0gbWFwIC0gT2JqZWN0IHdoZXJlIHRoZSBrZXkgaXMgdGhlIHByb3BlcnR5IHRvIG1vZGlmeSBhbmQgdGhlIHZhbHVlIGFzIHRoZSBwcm9wZXJ0eSB2YWx1ZVxuICAgICAqXG4gICAgICogVXNlIHRoaXMgbWV0aG9kIHRvIHNldCBmb250IHByb3BlcnR5IG9mIHRoZSB0ZXh0IGVudGl0eS4gIFBvc3NpYmxlIHZhbHVlcyBhcmU6IHR5cGUsIHdlaWdodCwgc2l6ZSwgZmFtaWx5LCBsaW5lSGVpZ2h0LCBhbmQgdmFyaWFudC5cbiAgICAgKlxuICAgICAqIFdoZW4gcmVuZGVyZWQgYnkgdGhlIGNhbnZhcywgbGluZUhlaWdodCBhbmQgdmFyaWFudCB3aWxsIGJlIGlnbm9yZWQuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIENyYWZ0eS5lKFwiMkQsIERPTSwgVGV4dFwiKS50ZXh0Rm9udCh7IHR5cGU6ICdpdGFsaWMnLCBmYW1pbHk6ICdBcmlhbCcgfSk7XG4gICAgICogQ3JhZnR5LmUoXCIyRCwgQ2FudmFzLCBUZXh0XCIpLnRleHRGb250KHsgc2l6ZTogJzIwcHgnLCB3ZWlnaHQ6ICdib2xkJyB9KTtcbiAgICAgKlxuICAgICAqIENyYWZ0eS5lKFwiMkQsIENhbnZhcywgVGV4dFwiKS50ZXh0Rm9udChcInR5cGVcIiwgXCJpdGFsaWNcIik7XG4gICAgICogQ3JhZnR5LmUoXCIyRCwgQ2FudmFzLCBUZXh0XCIpLnRleHRGb250KFwidHlwZVwiKTsgLy8gaXRhbGljXG4gICAgICogfn5+XG4gICAgICovXG4gICAgdGV4dEZvbnQ6IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAvL2lmIGp1c3QgdGhlIGtleSwgcmV0dXJuIHRoZSB2YWx1ZVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fdGV4dEZvbnRba2V5XTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBrZXkgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBwcm9wZXJ0eUtleSBpbiBrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYocHJvcGVydHlLZXkgPT0gJ2ZhbWlseScpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdGV4dEZvbnRbcHJvcGVydHlLZXldID0gXCInXCIgKyBrZXlbcHJvcGVydHlLZXldICsgXCInXCI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl90ZXh0Rm9udFtwcm9wZXJ0eUtleV0gPSBrZXlbcHJvcGVydHlLZXldO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fdGV4dEZvbnRba2V5XSA9IHZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaGFzKFwiQ2FudmFzXCIpIClcbiAgICAgICAgICAgIHRoaXMuX3Jlc2l6ZUZvckNhbnZhcygpO1xuXG4gICAgICAgIHRoaXMudHJpZ2dlcihcIkludmFsaWRhdGVcIik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG4gICAgLyoqQFxuICAgICAqICMudW5zZWxlY3RhYmxlXG4gICAgICogQGNvbXAgVGV4dFxuICAgICAqIEB0cmlnZ2VycyBJbnZhbGlkYXRlXG4gICAgICogQHNpZ24gcHVibGljIHRoaXMgLnVuc2VsZWN0YWJsZSgpXG4gICAgICpcbiAgICAgKiBUaGlzIG1ldGhvZCBzZXRzIHRoZSB0ZXh0IHNvIHRoYXQgaXQgY2Fubm90IGJlIHNlbGVjdGVkIChoaWdobGlnaHRlZCkgYnkgZHJhZ2dpbmcuXG4gICAgICogKENhbnZhcyB0ZXh0IGNhbiBuZXZlciBiZSBoaWdobGlnaHRlZCwgc28gdGhpcyBvbmx5IG1hdHRlcnMgZm9yIERPTSB0ZXh0LilcbiAgICAgKiBXb3JrcyBieSBjaGFuZ2luZyB0aGUgY3NzIHByb3BlcnR5IFwidXNlci1zZWxlY3RcIiBhbmQgaXRzIHZhcmlhbnRzLlxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB+fn5cbiAgICAgKiBDcmFmdHkuZShcIjJELCBET00sIFRleHRcIikudGV4dCgnVGhpcyB0ZXh0IGNhbm5vdCBiZSBoaWdobGlnaHRlZCEnKS51bnNlbGVjdGFibGUoKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICB1bnNlbGVjdGFibGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy84MjY3ODIvY3NzLXJ1bGUtdG8tZGlzYWJsZS10ZXh0LXNlbGVjdGlvbi1oaWdobGlnaHRpbmdcbiAgICAgICAgaWYgKHRoaXMuaGFzKFwiRE9NXCIpKSB7XG4gICAgICAgICAgICB0aGlzLmNzcyh7XG4gICAgICAgICAgICAgICAgJy13ZWJraXQtdG91Y2gtY2FsbG91dCc6ICdub25lJyxcbiAgICAgICAgICAgICAgICAnLXdlYmtpdC11c2VyLXNlbGVjdCc6ICdub25lJyxcbiAgICAgICAgICAgICAgICAnLWtodG1sLXVzZXItc2VsZWN0JzogJ25vbmUnLFxuICAgICAgICAgICAgICAgICctbW96LXVzZXItc2VsZWN0JzogJ25vbmUnLFxuICAgICAgICAgICAgICAgICctbXMtdXNlci1zZWxlY3QnOiAnbm9uZScsXG4gICAgICAgICAgICAgICAgJ3VzZXItc2VsZWN0JzogJ25vbmUnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIkludmFsaWRhdGVcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG59KTsiLCJ2YXIgQ3JhZnR5ID0gcmVxdWlyZSgnLi9jb3JlLmpzJyksXG4gICAgZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQ7XG5cbi8qKkBcbiAqICNEZWxheVxuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICovXG5DcmFmdHkuYyhcIkRlbGF5XCIsIHtcbiAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2RlbGF5cyA9IFtdO1xuICAgICAgICB0aGlzLmJpbmQoXCJFbnRlckZyYW1lXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMuX2RlbGF5cy5sZW5ndGg7XG4gICAgICAgICAgICB3aGlsZSAoLS1pbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGl0ZW0gPSB0aGlzLl9kZWxheXNbaW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChpdGVtLnN0YXJ0ICsgaXRlbS5kZWxheSArIGl0ZW0ucGF1c2UgPCBub3cpIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlbS5mdW5jLmNhbGwodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpdGVtLnJlcGVhdCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlc2NoZWR1bGUgaXRlbVxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS5zdGFydCA9IG5vdztcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0ucGF1c2UgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS5wYXVzZUJ1ZmZlciA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnJlcGVhdC0tO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGl0ZW0ucmVwZWF0IDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBpdGVtIGZyb20gYXJyYXlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2RlbGF5cy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5iaW5kKFwiUGF1c2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgZm9yICh2YXIgaW5kZXggaW4gdGhpcy5fZGVsYXlzKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZGVsYXlzW2luZGV4XS5wYXVzZUJ1ZmZlciA9IG5vdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuYmluZChcIlVucGF1c2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgZm9yICh2YXIgaW5kZXggaW4gdGhpcy5fZGVsYXlzKSB7XG4gICAgICAgICAgICAgICAgdmFyIGl0ZW0gPSB0aGlzLl9kZWxheXNbaW5kZXhdO1xuICAgICAgICAgICAgICAgIGl0ZW0ucGF1c2UgKz0gbm93IC0gaXRlbS5wYXVzZUJ1ZmZlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICAvKipAXG4gICAgICogIy5kZWxheVxuICAgICAqIEBjb21wIERlbGF5XG4gICAgICogQHNpZ24gcHVibGljIHRoaXMuZGVsYXkoRnVuY3Rpb24gY2FsbGJhY2ssIE51bWJlciBkZWxheSlcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgLSBNZXRob2QgdG8gZXhlY3V0ZSBhZnRlciBnaXZlbiBhbW91bnQgb2YgbWlsbGlzZWNvbmRzXG4gICAgICogQHBhcmFtIGRlbGF5IC0gQW1vdW50IG9mIG1pbGxpc2Vjb25kcyB0byBleGVjdXRlIHRoZSBtZXRob2RcbiAgICAgKiBAcGFyYW0gcmVwZWF0IC0gSG93IG9mdGVuIHRvIHJlcGVhdCB0aGUgZGVsYXllZCBmdW5jdGlvbi4gQSB2YWx1ZSBvZiAwIHRyaWdnZXJzIHRoZSBkZWxheWVkXG4gICAgICogZnVuY3Rpb24gZXhhY3RseSBvbmNlLiBBIHZhbHVlIG4gPiAwIHRyaWdnZXJzIHRoZSBkZWxheWVkIGZ1bmN0aW9uIGV4YWN0bHkgbisxIHRpbWVzLiBBXG4gICAgICogdmFsdWUgb2YgLTEgdHJpZ2dlcnMgdGhlIGRlbGF5ZWQgZnVuY3Rpb24gaW5kZWZpbml0ZWx5LlxuICAgICAqXG4gICAgICogVGhlIGRlbGF5IG1ldGhvZCB3aWxsIGV4ZWN1dGUgYSBmdW5jdGlvbiBhZnRlciBhIGdpdmVuIGFtb3VudCBvZiB0aW1lIGluIG1pbGxpc2Vjb25kcy5cbiAgICAgKlxuICAgICAqIEl0IGlzIG5vdCBhIHdyYXBwZXIgZm9yIGBzZXRUaW1lb3V0YC5cbiAgICAgKlxuICAgICAqIElmIENyYWZ0eSBpcyBwYXVzZWQsIHRoZSBkZWxheSBpcyBpbnRlcnJ1cHRlZCB3aXRoIHRoZSBwYXVzZSBhbmQgdGhlbiByZXN1bWUgd2hlbiB1bnBhdXNlZFxuICAgICAqXG4gICAgICogSWYgdGhlIGVudGl0eSBpcyBkZXN0cm95ZWQsIHRoZSBkZWxheSBpcyBhbHNvIGRlc3Ryb3llZCBhbmQgd2lsbCBub3QgaGF2ZSBlZmZlY3QuXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIH5+flxuICAgICAqIGNvbnNvbGUubG9nKFwic3RhcnRcIik7XG4gICAgICogQ3JhZnR5LmUoXCJEZWxheVwiKS5kZWxheShmdW5jdGlvbigpIHtcbiAgICAgKiAgIGNvbnNvbGUubG9nKFwiMTAwbXMgbGF0ZXJcIik7XG4gICAgICogfSwgMTAwLCAwKTtcbiAgICAgKiB+fn5cbiAgICAgKi9cbiAgICBkZWxheTogZnVuY3Rpb24gKGZ1bmMsIGRlbGF5LCByZXBlYXQpIHtcbiAgICAgICAgdGhpcy5fZGVsYXlzLnB1c2goe1xuICAgICAgICAgICAgc3RhcnQ6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgZnVuYzogZnVuYyxcbiAgICAgICAgICAgIGRlbGF5OiBkZWxheSxcbiAgICAgICAgICAgIHJlcGVhdDogKHJlcGVhdCA8IDAgPyBJbmZpbml0eSA6IHJlcGVhdCkgfHwgMCxcbiAgICAgICAgICAgIHBhdXNlQnVmZmVyOiAwLFxuICAgICAgICAgICAgcGF1c2U6IDBcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn0pOyIsIm1vZHVsZS5leHBvcnRzID0gXCIwLjYuMVwiOyIsInZhciBDcmFmdHkgPSByZXF1aXJlKCcuL2NvcmUuanMnKSxcbiAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudDtcblxuQ3JhZnR5LmV4dGVuZCh7XG4gICAgLyoqQFxuICAgICAqICNDcmFmdHkudmlld3BvcnRcbiAgICAgKiBAY2F0ZWdvcnkgU3RhZ2VcbiAgICAgKiBAdHJpZ2dlciBWaWV3cG9ydFNjcm9sbCAtIHdoZW4gdGhlIHZpZXdwb3J0J3MgeCBvciB5IGNvb3JkaW5hdGVzIGNoYW5nZVxuICAgICAqIEB0cmlnZ2VyIFZpZXdwb3J0U2NhbGUgLSB3aGVuIHRoZSB2aWV3cG9ydCdzIHNjYWxlIGNoYW5nZXNcbiAgICAgKiBAdHJpZ2dlciBWaWV3cG9ydFJlc2l6ZSAtIHdoZW4gdGhlIHZpZXdwb3J0J3MgZGltZW5zaW9uJ3MgY2hhbmdlXG4gICAgICogQHRyaWdnZXIgSW52YWxpZGF0ZVZpZXdwb3J0IC0gd2hlbiB0aGUgdmlld3BvcnQgY2hhbmdlc1xuICAgICAqIEB0cmlnZ2VyIFN0b3BDYW1lcmEgLSB3aGVuIGFueSBjYW1lcmEgYW5pbWF0aW9ucyBzaG91bGQgc3RvcCwgc3VjaCBhcyBhdCB0aGUgc3RhcnQgb2YgYSBuZXcgYW5pbWF0aW9uLlxuICAgICAqIEB0cmlnZ2VyIENhbWVyYUFuaW1hdGlvbkRvbmUgLSB3aGVuIGEgY2FtZXJhIGFuaW1hdGlvbiBjb21lcyByZWFjaGVzIGNvbXBsZXRpb25cbiAgICAgKlxuICAgICAqIFZpZXdwb3J0IGlzIGVzc2VudGlhbGx5IGEgMkQgY2FtZXJhIGxvb2tpbmcgYXQgdGhlIHN0YWdlLiBDYW4gYmUgbW92ZWQgd2hpY2hcbiAgICAgKiBpbiB0dXJuIHdpbGwgcmVhY3QganVzdCBsaWtlIGEgY2FtZXJhIG1vdmluZyBpbiB0aGF0IGRpcmVjdGlvbi5cbiAgICAgKi9cbiAgICB2aWV3cG9ydDoge1xuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQuY2xhbXBUb0VudGl0aWVzXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKlxuICAgICAgICAgKiBEZWNpZGVzIGlmIHRoZSB2aWV3cG9ydCBmdW5jdGlvbnMgc2hvdWxkIGNsYW1wIHRvIGdhbWUgZW50aXRpZXMuXG4gICAgICAgICAqIFdoZW4gc2V0IHRvIGB0cnVlYCBmdW5jdGlvbnMgc3VjaCBhcyBDcmFmdHkudmlld3BvcnQubW91c2Vsb29rKCkgd2lsbCBub3QgYWxsb3cgeW91IHRvIG1vdmUgdGhlXG4gICAgICAgICAqIHZpZXdwb3J0IG92ZXIgYXJlYXMgb2YgdGhlIGdhbWUgdGhhdCBoYXMgbm8gZW50aXRpZXMuXG4gICAgICAgICAqIEZvciBkZXZlbG9wbWVudCBpdCBjYW4gYmUgdXNlZnVsIHRvIHNldCB0aGlzIHRvIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgY2xhbXBUb0VudGl0aWVzOiB0cnVlLFxuICAgICAgICBfd2lkdGg6IDAsXG4gICAgICAgIF9oZWlnaHQ6IDAsXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS52aWV3cG9ydC54XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKlxuICAgICAgICAgKiBXaWxsIG1vdmUgdGhlIHN0YWdlIGFuZCB0aGVyZWZvcmUgZXZlcnkgdmlzaWJsZSBlbnRpdHkgYWxvbmcgdGhlIGB4YFxuICAgICAgICAgKiBheGlzIGluIHRoZSBvcHBvc2l0ZSBkaXJlY3Rpb24uXG4gICAgICAgICAqXG4gICAgICAgICAqIFdoZW4gdGhpcyB2YWx1ZSBpcyBzZXQsIGl0IHdpbGwgc2hpZnQgdGhlIGVudGlyZSBzdGFnZS4gVGhpcyBtZWFucyB0aGF0IGVudGl0eVxuICAgICAgICAgKiBwb3NpdGlvbnMgYXJlIG5vdCBleGFjdGx5IHdoZXJlIHRoZXkgYXJlIG9uIHNjcmVlbi4gVG8gZ2V0IHRoZSBleGFjdCBwb3NpdGlvbixcbiAgICAgICAgICogc2ltcGx5IGFkZCBgQ3JhZnR5LnZpZXdwb3J0LnhgIG9udG8gdGhlIGVudGl0aWVzIGB4YCBwb3NpdGlvbi5cbiAgICAgICAgICovXG4gICAgICAgIF94OiAwLFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQueVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkudmlld3BvcnRcbiAgICAgICAgICpcbiAgICAgICAgICogV2lsbCBtb3ZlIHRoZSBzdGFnZSBhbmQgdGhlcmVmb3JlIGV2ZXJ5IHZpc2libGUgZW50aXR5IGFsb25nIHRoZSBgeWBcbiAgICAgICAgICogYXhpcyBpbiB0aGUgb3Bwb3NpdGUgZGlyZWN0aW9uLlxuICAgICAgICAgKlxuICAgICAgICAgKiBXaGVuIHRoaXMgdmFsdWUgaXMgc2V0LCBpdCB3aWxsIHNoaWZ0IHRoZSBlbnRpcmUgc3RhZ2UuIFRoaXMgbWVhbnMgdGhhdCBlbnRpdHlcbiAgICAgICAgICogcG9zaXRpb25zIGFyZSBub3QgZXhhY3RseSB3aGVyZSB0aGV5IGFyZSBvbiBzY3JlZW4uIFRvIGdldCB0aGUgZXhhY3QgcG9zaXRpb24sXG4gICAgICAgICAqIHNpbXBseSBhZGQgYENyYWZ0eS52aWV3cG9ydC55YCBvbnRvIHRoZSBlbnRpdGllcyBgeWAgcG9zaXRpb24uXG4gICAgICAgICAqL1xuICAgICAgICBfeTogMCxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQuX3NjYWxlXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKlxuICAgICAgICAgKiBXaGF0IHNjYWxlIHRvIHJlbmRlciB0aGUgdmlld3BvcnQgYXQuICBUaGlzIGRvZXMgbm90IGFsdGVyIHRoZSBzaXplIG9mIHRoZSBzdGFnZSBpdHNlbGYsIGJ1dCB0aGUgbWFnbmlmaWNhdGlvbiBvZiB3aGF0IGl0IHNob3dzLlxuICAgICAgICAgKi9cblxuICAgICAgICBfc2NhbGU6IDEsXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LnZpZXdwb3J0LmJvdW5kc1xuICAgICAgICAgKiBAY29tcCBDcmFmdHkudmlld3BvcnRcbiAgICAgICAgICpcbiAgICAgICAgICogQSByZWN0YW5nbGUgd2hpY2ggZGVmaW5lcyB0aGUgYm91bmRzIG9mIHRoZSB2aWV3cG9ydC5cbiAgICAgICAgICogSXQgc2hvdWxkIGJlIGFuIG9iamVjdCB3aXRoIHR3byBwcm9wZXJ0aWVzLCBgbWF4YCBhbmQgYG1pbmAsXG4gICAgICAgICAqIHdoaWNoIGFyZSBlYWNoIGFuIG9iamVjdCB3aXRoIGB4YCBhbmQgYHlgIHByb3BlcnRpZXMuXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIHRoaXMgcHJvcGVydHkgaXMgbnVsbCwgQ3JhZnR5IHVzZXMgdGhlIGJvdW5kaW5nIGJveCBvZiBhbGwgdGhlIGl0ZW1zXG4gICAgICAgICAqIG9uIHRoZSBzdGFnZS4gIFRoaXMgaXMgdGhlIGluaXRpYWwgdmFsdWUuICAoVG8gcHJldmVudCB0aGlzIGJlaGF2aW9yLCBzZXQgYENyYWZ0eS52aWV3cG9ydC5jbGFtcFRvRW50aXRpZXNgIHRvIGBmYWxzZWApXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIHlvdSB3aXNoIHRvIGJvdW5kIHRoZSB2aWV3cG9ydCBhbG9uZyBvbmUgYXhpcyBidXQgbm90IHRoZSBvdGhlciwgeW91IGNhbiB1c2UgYC1JbmZpbml0eWAgYW5kIGArSW5maW5pdHlgIGFzIGJvdW5kcy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHNlZSBDcmFmdHkudmlld3BvcnQuY2xhbXBUb0VudGl0aWVzXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIFNldCB0aGUgYm91bmRzIHRvIGEgNTAwIGJ5IDUwMCBzcXVhcmU6XG4gICAgICAgICAqXG4gICAgICAgICAqIH5+flxuICAgICAgICAgKiBDcmFmdHkudmlld3BvcnQuYm91bmRzID0ge21pbjp7eDowLCB5OjB9LCBtYXg6e3g6NTAwLCB5OjUwMH19O1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIGJvdW5kczogbnVsbCxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQuc2Nyb2xsXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKiBAc2lnbiBDcmFmdHkudmlld3BvcnQuc2Nyb2xsKFN0cmluZyBheGlzLCBOdW1iZXIgdmFsKVxuICAgICAgICAgKiBAcGFyYW0gYXhpcyAtICd4JyBvciAneSdcbiAgICAgICAgICogQHBhcmFtIHZhbCAtIFRoZSBuZXcgYWJzb2x1dGUgcG9zaXRpb24gb24gdGhlIGF4aXNcbiAgICAgICAgICpcbiAgICAgICAgICogV2lsbCBtb3ZlIHRoZSB2aWV3cG9ydCB0byB0aGUgcG9zaXRpb24gZ2l2ZW4gb24gdGhlIHNwZWNpZmllZCBheGlzXG4gICAgICAgICAqXG4gICAgICAgICAqIEBleGFtcGxlXG4gICAgICAgICAqIFdpbGwgbW92ZSB0aGUgY2FtZXJhIDUwMCBwaXhlbHMgcmlnaHQgb2YgaXRzIGluaXRpYWwgcG9zaXRpb24sIGluIGVmZmVjdFxuICAgICAgICAgKiBzaGlmdGluZyBldmVyeXRoaW5nIGluIHRoZSB2aWV3cG9ydCA1MDAgcGl4ZWxzIHRvIHRoZSBsZWZ0LlxuICAgICAgICAgKlxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICogQ3JhZnR5LnZpZXdwb3J0LnNjcm9sbCgnX3gnLCA1MDApO1xuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHNjcm9sbDogZnVuY3Rpb24gKGF4aXMsIHZhbCkge1xuICAgICAgICAgICAgdGhpc1theGlzXSA9IHZhbDtcbiAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiVmlld3BvcnRTY3JvbGxcIik7XG4gICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIkludmFsaWRhdGVWaWV3cG9ydFwiKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWN0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIF94OiAtdGhpcy5feCxcbiAgICAgICAgICAgICAgICBfeTogLXRoaXMuX3ksXG4gICAgICAgICAgICAgICAgX3c6IHRoaXMud2lkdGggLyB0aGlzLl9zY2FsZSxcbiAgICAgICAgICAgICAgICBfaDogdGhpcy5oZWlnaHQgLyB0aGlzLl9zY2FsZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipAIFxuXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQucGFuXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudmlld3BvcnQucGFuKFN0cmluZyBheGlzLCBOdW1iZXIgdiwgTnVtYmVyIHRpbWUpXG4gICAgICAgICAqIEBwYXJhbSBTdHJpbmcgYXhpcyAtICd4JyBvciAneScuIFRoZSBheGlzIHRvIG1vdmUgdGhlIGNhbWVyYSBvblxuICAgICAgICAgKiBAcGFyYW0gTnVtYmVyIHYgLSB0aGUgZGlzdGFuY2UgdG8gbW92ZSB0aGUgY2FtZXJhIGJ5XG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgdGltZSAtIFRoZSBkdXJhdGlvbiBpbiBtcyBmb3IgdGhlIGVudGlyZSBjYW1lcmEgbW92ZW1lbnRcbiAgICAgICAgICpcbiAgICAgICAgICogUGFucyB0aGUgY2FtZXJhIGEgZ2l2ZW4gbnVtYmVyIG9mIHBpeGVscyBvdmVyIHRoZSBzcGVjaWZpZWQgdGltZVxuICAgICAgICAgKi9cbiAgICAgICAgcGFuOiAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHR3ZWVucyA9IHt9LCBpLCBib3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgdmFyIHRhcmdldFgsIHRhcmdldFksIHN0YXJ0aW5nWCwgc3RhcnRpbmdZLCBlYXNpbmc7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVudGVyRnJhbWUoZSkge1xuICAgICAgICAgICAgICAgIGVhc2luZy50aWNrKGUuZHQpO1xuICAgICAgICAgICAgICAgIHZhciB2ID0gZWFzaW5nLnZhbHVlKCk7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnggPSAoMS12KSAqIHN0YXJ0aW5nWCArIHYgKiB0YXJnZXRYO1xuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC55ID0gKDEtdikgKiBzdGFydGluZ1kgKyB2ICogdGFyZ2V0WTtcbiAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQuX2NsYW1wKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZWFzaW5nLmNvbXBsZXRlKXtcbiAgICAgICAgICAgICAgICAgICAgc3RvcFBhbigpO1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIkNhbWVyYUFuaW1hdGlvbkRvbmVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdG9wUGFuKCl7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnVuYmluZChcIkVudGVyRnJhbWVcIiwgZW50ZXJGcmFtZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIENyYWZ0eS5iaW5kKFwiU3RvcENhbWVyYVwiLCBzdG9wUGFuKTtcblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChkeCwgZHksIHRpbWUpIHtcbiAgICAgICAgICAgICAgICAvLyBDYW5jZWwgYW55IGN1cnJlbnQgY2FtZXJhIGNvbnRyb2xcbiAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlN0b3BDYW1lcmFcIik7XG5cbiAgICAgICAgICAgICAgICAvLyBIYW5kbGUgcmVxdWVzdCB0byByZXNldFxuICAgICAgICAgICAgICAgIGlmIChkeCA9PSAncmVzZXQnKSB7XG4gICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN0YXJ0aW5nWCA9IENyYWZ0eS52aWV3cG9ydC5feDtcbiAgICAgICAgICAgICAgICBzdGFydGluZ1kgPSBDcmFmdHkudmlld3BvcnQuX3k7XG4gICAgICAgICAgICAgICAgdGFyZ2V0WCA9IHN0YXJ0aW5nWCAtIGR4O1xuICAgICAgICAgICAgICAgIHRhcmdldFkgPSBzdGFydGluZ1kgLSBkeTtcblxuICAgICAgICAgICAgICAgIGVhc2luZyA9IG5ldyBDcmFmdHkuZWFzaW5nKHRpbWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gYmluZCB0byBldmVudCwgdXNpbmcgdW5pcXVlQmluZCBwcmV2ZW50cyBtdWx0aXBsZSBjb3BpZXMgZnJvbSBiZWluZyBib3VuZFxuICAgICAgICAgICAgICAgIENyYWZ0eS51bmlxdWVCaW5kKFwiRW50ZXJGcmFtZVwiLCBlbnRlckZyYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KSgpLFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS52aWV3cG9ydC5mb2xsb3dcbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LnZpZXdwb3J0XG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS52aWV3cG9ydC5mb2xsb3coT2JqZWN0IHRhcmdldCwgTnVtYmVyIG9mZnNldHgsIE51bWJlciBvZmZzZXR5KVxuICAgICAgICAgKiBAcGFyYW0gT2JqZWN0IHRhcmdldCAtIEFuIGVudGl0eSB3aXRoIHRoZSAyRCBjb21wb25lbnRcbiAgICAgICAgICogQHBhcmFtIE51bWJlciBvZmZzZXR4IC0gRm9sbG93IHRhcmdldCBzaG91bGQgYmUgb2Zmc2V0eCBwaXhlbHMgYXdheSBmcm9tIGNlbnRlclxuICAgICAgICAgKiBAcGFyYW0gTnVtYmVyIG9mZnNldHkgLSBQb3NpdGl2ZSBwdXRzIHRhcmdldCB0byB0aGUgcmlnaHQgb2YgY2VudGVyXG4gICAgICAgICAqXG4gICAgICAgICAqIEZvbGxvd3MgYSBnaXZlbiBlbnRpdHkgd2l0aCB0aGUgMkQgY29tcG9uZW50LiBJZiBmb2xsb3dpbmcgdGFyZ2V0IHdpbGwgdGFrZSBhIHBvcnRpb24gb2ZcbiAgICAgICAgICogdGhlIHZpZXdwb3J0IG91dCBvZiBib3VuZHMgb2YgdGhlIHdvcmxkLCBmb2xsb3dpbmcgd2lsbCBzdG9wIHVudGlsIHRoZSB0YXJnZXQgbW92ZXMgYXdheS5cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIHZhciBlbnQgPSBDcmFmdHkuZSgnMkQsIERPTScpLmF0dHIoe3c6IDEwMCwgaDogMTAwOn0pO1xuICAgICAgICAgKiBDcmFmdHkudmlld3BvcnQuZm9sbG93KGVudCwgMCwgMCk7XG4gICAgICAgICAqIH5+flxuICAgICAgICAgKi9cbiAgICAgICAgZm9sbG93OiAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG9sZFRhcmdldCwgb2ZmeCwgb2ZmeTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gY2hhbmdlKCkge1xuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5zY3JvbGwoJ194JywgLSh0aGlzLnggKyAodGhpcy53IC8gMikgLSAoQ3JhZnR5LnZpZXdwb3J0LndpZHRoIC8gMikgLSBvZmZ4KSk7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnNjcm9sbCgnX3knLCAtKHRoaXMueSArICh0aGlzLmggLyAyKSAtIChDcmFmdHkudmlld3BvcnQuaGVpZ2h0IC8gMikgLSBvZmZ5KSk7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0Ll9jbGFtcCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdG9wRm9sbG93KCl7XG4gICAgICAgICAgICAgICAgaWYgKG9sZFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgb2xkVGFyZ2V0LnVuYmluZCgnTW92ZScsIGNoYW5nZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIENyYWZ0eS5iaW5kKFwiU3RvcENhbWVyYVwiLCBzdG9wRm9sbG93KTtcblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICh0YXJnZXQsIG9mZnNldHgsIG9mZnNldHkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCAhdGFyZ2V0LmhhcygnMkQnKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiU3RvcENhbWVyYVwiKTtcblxuICAgICAgICAgICAgICAgIG9sZFRhcmdldCA9IHRhcmdldDtcbiAgICAgICAgICAgICAgICBvZmZ4ID0gKHR5cGVvZiBvZmZzZXR4ICE9ICd1bmRlZmluZWQnKSA/IG9mZnNldHggOiAwO1xuICAgICAgICAgICAgICAgIG9mZnkgPSAodHlwZW9mIG9mZnNldHkgIT0gJ3VuZGVmaW5lZCcpID8gb2Zmc2V0eSA6IDA7XG5cbiAgICAgICAgICAgICAgICB0YXJnZXQuYmluZCgnTW92ZScsIGNoYW5nZSk7XG4gICAgICAgICAgICAgICAgY2hhbmdlLmNhbGwodGFyZ2V0KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKCksXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LnZpZXdwb3J0LmNlbnRlck9uXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudmlld3BvcnQuY2VudGVyT24oT2JqZWN0IHRhcmdldCwgTnVtYmVyIHRpbWUpXG4gICAgICAgICAqIEBwYXJhbSBPYmplY3QgdGFyZ2V0IC0gQW4gZW50aXR5IHdpdGggdGhlIDJEIGNvbXBvbmVudFxuICAgICAgICAgKiBAcGFyYW0gTnVtYmVyIHRpbWUgLSBUaGUgZHVyYXRpb24gaW4gbXMgb2YgdGhlIGNhbWVyYSBtb3Rpb25cbiAgICAgICAgICpcbiAgICAgICAgICogQ2VudGVycyB0aGUgdmlld3BvcnQgb24gdGhlIGdpdmVuIGVudGl0eS5cbiAgICAgICAgICovXG4gICAgICAgIGNlbnRlck9uOiBmdW5jdGlvbiAodGFyZywgdGltZSkge1xuICAgICAgICAgICAgdmFyIHggPSB0YXJnLnggKyBDcmFmdHkudmlld3BvcnQueCxcbiAgICAgICAgICAgICAgICB5ID0gdGFyZy55ICsgQ3JhZnR5LnZpZXdwb3J0LnksXG4gICAgICAgICAgICAgICAgbWlkX3ggPSB0YXJnLncgLyAyLFxuICAgICAgICAgICAgICAgIG1pZF95ID0gdGFyZy5oIC8gMixcbiAgICAgICAgICAgICAgICBjZW50X3ggPSBDcmFmdHkudmlld3BvcnQud2lkdGggLyAyLFxuICAgICAgICAgICAgICAgIGNlbnRfeSA9IENyYWZ0eS52aWV3cG9ydC5oZWlnaHQgLyAyLFxuICAgICAgICAgICAgICAgIG5ld194ID0geCArIG1pZF94IC0gY2VudF94LFxuICAgICAgICAgICAgICAgIG5ld195ID0geSArIG1pZF95IC0gY2VudF95O1xuXG4gICAgICAgICAgICBDcmFmdHkudmlld3BvcnQucGFuKG5ld194LCBuZXdfeSwgdGltZSk7XG4gICAgICAgIH0sXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS52aWV3cG9ydC5fem9vbVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkudmlld3BvcnRcbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyB2YWx1ZSBrZWVwcyBhbiBhbW91bnQgb2Ygdmlld3BvcnQgem9vbSwgcmVxdWlyZWQgZm9yIGNhbGN1bGF0aW5nIG1vdXNlIHBvc2l0aW9uIGF0IGVudGl0eVxuICAgICAgICAgKi9cbiAgICAgICAgX3pvb206IDEsXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LnZpZXdwb3J0Lnpvb21cbiAgICAgICAgICogQGNvbXAgQ3JhZnR5LnZpZXdwb3J0XG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS52aWV3cG9ydC56b29tKE51bWJlciBhbXQsIE51bWJlciBjZW50X3gsIE51bWJlciBjZW50X3ksIE51bWJlciB0aW1lKVxuICAgICAgICAgKiBAcGFyYW0gTnVtYmVyIGFtdCAtIGFtb3VudCB0byB6b29tIGluIG9uIHRoZSB0YXJnZXQgYnkgKGVnLiAyLCA0LCAwLjUpXG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgY2VudF94IC0gdGhlIGNlbnRlciB0byB6b29tIG9uXG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgY2VudF95IC0gdGhlIGNlbnRlciB0byB6b29tIG9uXG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgdGltZSAtIHRoZSBkdXJhdGlvbiBpbiBtcyBvZiB0aGUgZW50aXJlIHpvb20gb3BlcmF0aW9uXG4gICAgICAgICAqXG4gICAgICAgICAqIFpvb21zIHRoZSBjYW1lcmEgaW4gb24gYSBnaXZlbiBwb2ludC4gYW10ID4gMSB3aWxsIGJyaW5nIHRoZSBjYW1lcmEgY2xvc2VyIHRvIHRoZSBzdWJqZWN0XG4gICAgICAgICAqIGFtdCA8IDEgd2lsbCBicmluZyBpdCBmYXJ0aGVyIGF3YXkuIGFtdCA9IDAgd2lsbCByZXNldCB0byB0aGUgZGVmYXVsdCB6b29tIGxldmVsXG4gICAgICAgICAqIFpvb21pbmcgaXMgbXVsdGlwbGljYXRpdmUuIFRvIHJlc2V0IHRoZSB6b29tIGFtb3VudCwgcGFzcyAwLlxuICAgICAgICAgKi9cbiAgICAgICAgem9vbTogKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdG9wWm9vbSgpe1xuICAgICAgICAgICAgICAgIENyYWZ0eS51bmJpbmQoXCJFbnRlckZyYW1lXCIsIGVudGVyRnJhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgQ3JhZnR5LmJpbmQoXCJTdG9wQ2FtZXJhXCIsIHN0b3Bab29tKTtcblxuICAgICAgICAgICAgdmFyIHN0YXJ0aW5nWm9vbSwgZmluYWxab29tLCBmaW5hbEFtb3VudCwgc3RhcnRpbmdYLCBmaW5hbFgsIHN0YXJ0aW5nWSwgZmluYWxZLCBlYXNpbmc7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGVudGVyRnJhbWUoZSl7XG4gICAgICAgICAgICAgICAgdmFyIGFtb3VudCwgdjtcblxuICAgICAgICAgICAgICAgIGVhc2luZy50aWNrKGUuZHQpO1xuXG4gICAgICAgICAgICAgICAgLy8gVGhlIHNjYWxpbmcgc2hvdWxkIGhhcHBlbiBzbW9vdGhseSAtLSBzdGFydCBhdCAxLCBlbmQgYXQgZmluYWxBbW91bnQsIGFuZCBhdCBoYWxmIHdheSBzY2FsaW5nIHNob3VsZCBiZSBieSBmaW5hbEFtb3VudF4oMS8yKVxuICAgICAgICAgICAgICAgIC8vIFNpbmNlIHZhbHVlIGdvZXMgc21vb3RobHkgZnJvbSAwIHRvIDEsIHRoaXMgZnVmaWxscyB0aG9zZSByZXF1aXJlbWVudHNcbiAgICAgICAgICAgICAgICBhbW91bnQgPSBNYXRoLnBvdyhmaW5hbEFtb3VudCwgZWFzaW5nLnZhbHVlKCkgKTtcblxuICAgICAgICAgICAgICAgIC8vIFRoZSB2aWV3cG9ydCBzaG91bGQgbW92ZSBpbiBzdWNoIGEgd2F5IHRoYXQgbm8gcG9pbnQgcmV2ZXJzZXNcbiAgICAgICAgICAgICAgICAvLyBJZiBhIGFuZCBiIGFyZSB0aGUgdG9wIGxlZnQvYm90dG9tIHJpZ2h0IG9mIHRoZSB2aWV3cG9ydCwgdGhlbiB0aGUgYmVsb3cgY2FuIGJlIGRlcml2ZWQgZnJvbVxuICAgICAgICAgICAgICAgIC8vICAgICAgKGFfMC1iXzApLyhhLWIpID0gYW1vdW50LFxuICAgICAgICAgICAgICAgIC8vIGFuZCB0aGUgYXNzdW1wdGlvbiB0aGF0IGJvdGggYSBhbmQgYiBoYXZlIHRoZSBzYW1lIGZvcm1cbiAgICAgICAgICAgICAgICAvLyAgICAgIGEgPSBhXzAgKiAoMS12KSArIGFfZiAqIHYsXG4gICAgICAgICAgICAgICAgLy8gICAgICBiID0gYl8wICogKDEtdikgKyBiX2YgKiB2LlxuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMganVzdCBhbiBhcmJpdHJhcnkgcGFyYW1ldGVyaXphdGlvbiBvZiB0aGUgb25seSBzZW5zaWJsZSBwYXRoIGZvciB0aGUgdmlld3BvcnQgY29ybmVycyB0byB0YWtlLlxuICAgICAgICAgICAgICAgIC8vIEFuZCBieSBzeW1tZXRyeSB0aGV5IHNob3VsZCBiZSBwYXJhbWV0ZXJpemVkIGluIHRoZSBzYW1lIHdheSEgIFNvIG5vdCBtdWNoIGNob2ljZSBoZXJlLlxuICAgICAgICAgICAgICAgIGlmIChmaW5hbEFtb3VudCA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgdiA9IGVhc2luZy52YWx1ZSgpOyAgLy8gcHJldmVudCBOYU4hICBJZiB6b29tIGlzIHVzZWQgdGhpcyB3YXksIGl0J2xsIGp1c3QgYmVjb21lIGEgcGFuLlxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdiA9ICgxL2Ftb3VudCAtIDEgKSAvICgxL2ZpbmFsQW1vdW50IC0gMSk7XG5cbiAgICAgICAgICAgICAgICAvLyBTZXQgbmV3IHNjYWxlIGFuZCB2aWV3cG9ydCBwb3NpdGlvblxuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5zY2FsZSggYW1vdW50ICogc3RhcnRpbmdab29tICk7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnNjcm9sbChcIl94XCIsIHN0YXJ0aW5nWCAqICgxLXYpICsgZmluYWxYICogdiApO1xuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5zY3JvbGwoXCJfeVwiLCBzdGFydGluZ1kgKiAoMS12KSArIGZpbmFsWSAqIHYgKTtcbiAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQuX2NsYW1wKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZWFzaW5nLmNvbXBsZXRlKXtcbiAgICAgICAgICAgICAgICAgICAgc3RvcFpvb20oKTtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJDYW1lcmFBbmltYXRpb25Eb25lXCIpO1xuICAgICAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoYW10LCBjZW50X3gsIGNlbnRfeSwgdGltZSl7XG4gICAgICAgICAgICAgICAgaWYgKCFhbXQpIHsgLy8gd2UncmUgcmVzZXR0aW5nIHRvIGRlZmF1bHRzXG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5zY2FsZSgxKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDw9IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGltZSA9IGNlbnRfeDtcbiAgICAgICAgICAgICAgICAgICAgY2VudF94ID0gQ3JhZnR5LnZpZXdwb3J0LnggLSBDcmFmdHkudmlld3BvcnQud2lkdGg7XG4gICAgICAgICAgICAgICAgICAgIGNlbnRfeSA9IENyYWZ0eS52aWV3cG9ydC55IC0gQ3JhZnR5LnZpZXdwb3J0LmhlaWdodDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlN0b3BDYW1lcmFcIik7XG4gICAgICAgICAgICAgICAgc3RhcnRpbmdab29tID0gQ3JhZnR5LnZpZXdwb3J0Ll96b29tO1xuICAgICAgICAgICAgICAgIGZpbmFsQW1vdW50ID0gYW10O1xuICAgICAgICAgICAgICAgIGZpbmFsWm9vbSA9IHN0YXJ0aW5nWm9vbSAqIGZpbmFsQW1vdW50O1xuICAgICAgICAgICAgICAgIFxuXG4gICAgICAgICAgICAgICAgc3RhcnRpbmdYID0gQ3JhZnR5LnZpZXdwb3J0Lng7XG4gICAgICAgICAgICAgICAgc3RhcnRpbmdZID0gQ3JhZnR5LnZpZXdwb3J0Lnk7XG4gICAgICAgICAgICAgICAgZmluYWxYID0gLSAoY2VudF94IC0gQ3JhZnR5LnZpZXdwb3J0LndpZHRoICAvICgyICogZmluYWxab29tKSApO1xuICAgICAgICAgICAgICAgIGZpbmFsWSA9IC0gKGNlbnRfeSAtIENyYWZ0eS52aWV3cG9ydC5oZWlnaHQgLyAoMiAqIGZpbmFsWm9vbSkgKTtcblxuICAgICAgICAgICAgICAgIGVhc2luZyA9IG5ldyBDcmFmdHkuZWFzaW5nKHRpbWUpO1xuXG4gICAgICAgICAgICAgICAgQ3JhZnR5LnVuaXF1ZUJpbmQoXCJFbnRlckZyYW1lXCIsIGVudGVyRnJhbWUpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgXG4gICAgICAgIH0pKCksXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS52aWV3cG9ydC5zY2FsZVxuICAgICAgICAgKiBAY29tcCBDcmFmdHkudmlld3BvcnRcbiAgICAgICAgICogQHNpZ24gcHVibGljIHZvaWQgQ3JhZnR5LnZpZXdwb3J0LnNjYWxlKE51bWJlciBhbXQpXG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgYW10IC0gYW1vdW50IHRvIHpvb20vc2NhbGUgaW4gb24gdGhlIGVsZW1lbnQgb24gdGhlIHZpZXdwb3J0IGJ5IChlZy4gMiwgNCwgMC41KVxuICAgICAgICAgKlxuICAgICAgICAgKiBBZGp1c3RzIHRoZS4gYW10ID4gMSBpbmNyZWFzZSBhbGwgZW50aXRpZXMgb24gc3RhZ2VcbiAgICAgICAgICogYW10IDwgMSB3aWxsIHJlZHVjZSBhbGwgZW50aXRpZXMgb24gc3RhZ2UuIGFtdCA9IDAgd2lsbCByZXNldCB0aGUgem9vbS9zY2FsZS5cbiAgICAgICAgICogVG8gcmVzZXQgdGhlIHNjYWxlIGFtb3VudCwgcGFzcyAwLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIG1ldGhvZCBzZXRzIHRoZSBhYnNvbHV0ZSBzY2FsZSwgd2hpbGUgYENyYWZ0eS52aWV3cG9ydC56b29tYCBzZXRzIHRoZSBzY2FsZSByZWxhdGl2ZSB0byB0aGUgZXhpc3RpbmcgdmFsdWUuXG4gICAgICAgICAqIEBzZWUgQ3JhZnR5LnZpZXdwb3J0Lnpvb21cbiAgICAgICAgICpcbiAgICAgICAgICogQGV4YW1wbGVcbiAgICAgICAgICogfn5+XG4gICAgICAgICAqIENyYWZ0eS52aWV3cG9ydC5zY2FsZSgyKTsgLy90byBzZWUgZWZmZWN0IGFkZCBzb21lIGVudGl0aWVzIG9uIHN0YWdlLlxuICAgICAgICAgKiB+fn5cbiAgICAgICAgICovXG4gICAgICAgIHNjYWxlOiAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChhbXQpIHtcbiAgICAgICAgICAgICAgICB2YXIgZmluYWxfem9vbSA9IGFtdCA/IGFtdCA6IDE7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl96b29tID0gZmluYWxfem9vbTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zY2FsZSA9IGZpbmFsX3pvb207XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJJbnZhbGlkYXRlVmlld3BvcnRcIik7XG4gICAgICAgICAgICAgICAgQ3JhZnR5LnRyaWdnZXIoXCJWaWV3cG9ydFNjYWxlXCIpO1xuXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KSgpLFxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQubW91c2Vsb29rXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudmlld3BvcnQubW91c2Vsb29rKEJvb2xlYW4gYWN0aXZlKVxuICAgICAgICAgKiBAcGFyYW0gQm9vbGVhbiBhY3RpdmUgLSBBY3RpdmF0ZSBvciBkZWFjdGl2YXRlIG1vdXNlbG9va1xuICAgICAgICAgKlxuICAgICAgICAgKiBUb2dnbGUgbW91c2Vsb29rIG9uIHRoZSBjdXJyZW50IHZpZXdwb3J0LlxuICAgICAgICAgKiBTaW1wbHkgY2FsbCB0aGlzIGZ1bmN0aW9uIGFuZCB0aGUgdXNlciB3aWxsIGJlIGFibGUgdG9cbiAgICAgICAgICogZHJhZyB0aGUgdmlld3BvcnQgYXJvdW5kLlxuICAgICAgICAgKlxuICAgICAgICAgKiBJZiB0aGUgdXNlciBzdGFydHMgYSBkcmFnLCBcIlN0b3BDYW1lcmFcIiB3aWxsIGJlIHRyaWdnZXJlZCwgd2hpY2ggd2lsbCBjYW5jZWwgYW55IGV4aXN0aW5nIGNhbWVyYSBhbmltYXRpb25zLlxuICAgICAgICAgKi9cbiAgICAgICAgbW91c2Vsb29rOiAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFjdGl2ZSA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGRyYWdnaW5nID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgbGFzdE1vdXNlID0ge307XG4gICAgICAgICAgICBvbGQgPSB7fTtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHN0b3BMb29rKCl7XG4gICAgICAgICAgICAgICAgZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKG9wLCBhcmcpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIG9wID09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgICAgICBhY3RpdmUgPSBvcDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgQ3JhZnR5Lm1vdXNlT2JqcysrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgQ3JhZnR5Lm1vdXNlT2JqcyA9IE1hdGgubWF4KDAsIENyYWZ0eS5tb3VzZU9ianMgLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghYWN0aXZlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgc3dpdGNoIChvcCkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ21vdmUnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2RyYWcnOlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRyYWdnaW5nKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGRpZmYgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBhcmcuY2xpZW50WCAtIGxhc3RNb3VzZS54LFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogYXJnLmNsaWVudFkgLSBsYXN0TW91c2UueVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb3VzZS54ID0gYXJnLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb3VzZS55ID0gYXJnLmNsaWVudFk7XG5cbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnggKz0gZGlmZi54O1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQueSArPSBkaWZmLnk7XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC5fY2xhbXAoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhcnQnOlxuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlN0b3BDYW1lcmFcIik7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb3VzZS54ID0gYXJnLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RNb3VzZS55ID0gYXJnLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgICAgIGRyYWdnaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RvcCc6XG4gICAgICAgICAgICAgICAgICAgIGRyYWdnaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKCksXG4gICAgICAgIF9jbGFtcDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gY2xhbXBzIHRoZSB2aWV3cG9ydCB0byB0aGUgdmlld2FibGUgYXJlYVxuICAgICAgICAgICAgLy8gdW5kZXIgbm8gY2lyY3Vtc3RhbmNlcyBzaG91bGQgdGhlIHZpZXdwb3J0IHNlZSBzb21ldGhpbmcgb3V0c2lkZSB0aGUgYm91bmRhcnkgb2YgdGhlICd3b3JsZCdcbiAgICAgICAgICAgIGlmICghdGhpcy5jbGFtcFRvRW50aXRpZXMpIHJldHVybjtcbiAgICAgICAgICAgIHZhciBib3VuZCA9IHRoaXMuYm91bmRzIHx8IENyYWZ0eS5tYXAuYm91bmRhcmllcygpO1xuICAgICAgICAgICAgYm91bmQubWF4LnggKj0gdGhpcy5fem9vbTtcbiAgICAgICAgICAgIGJvdW5kLm1pbi54ICo9IHRoaXMuX3pvb207XG4gICAgICAgICAgICBib3VuZC5tYXgueSAqPSB0aGlzLl96b29tO1xuICAgICAgICAgICAgYm91bmQubWluLnkgKj0gdGhpcy5fem9vbTtcbiAgICAgICAgICAgIGlmIChib3VuZC5tYXgueCAtIGJvdW5kLm1pbi54ID4gQ3JhZnR5LnZpZXdwb3J0LndpZHRoKSB7XG4gICAgICAgICAgICAgICAgaWYgKENyYWZ0eS52aWV3cG9ydC54IDwgLWJvdW5kLm1heC54ICsgQ3JhZnR5LnZpZXdwb3J0LndpZHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC54ID0gLWJvdW5kLm1heC54ICsgQ3JhZnR5LnZpZXdwb3J0LndpZHRoO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoQ3JhZnR5LnZpZXdwb3J0LnggPiAtYm91bmQubWluLngpIHtcbiAgICAgICAgICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0LnggPSAtYm91bmQubWluLng7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQueCA9IC0xICogKGJvdW5kLm1pbi54ICsgKGJvdW5kLm1heC54IC0gYm91bmQubWluLngpIC8gMiAtIENyYWZ0eS52aWV3cG9ydC53aWR0aCAvIDIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGJvdW5kLm1heC55IC0gYm91bmQubWluLnkgPiBDcmFmdHkudmlld3BvcnQuaGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgaWYgKENyYWZ0eS52aWV3cG9ydC55IDwgLWJvdW5kLm1heC55ICsgQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQueSA9IC1ib3VuZC5tYXgueSArIENyYWZ0eS52aWV3cG9ydC5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChDcmFmdHkudmlld3BvcnQueSA+IC1ib3VuZC5taW4ueSkge1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudmlld3BvcnQueSA9IC1ib3VuZC5taW4ueTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIENyYWZ0eS52aWV3cG9ydC55ID0gLTEgKiAoYm91bmQubWluLnkgKyAoYm91bmQubWF4LnkgLSBib3VuZC5taW4ueSkgLyAyIC0gQ3JhZnR5LnZpZXdwb3J0LmhlaWdodCAvIDIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKkBcbiAgICAgICAgICogI0NyYWZ0eS52aWV3cG9ydC5pbml0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS52aWV3cG9ydFxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgdm9pZCBDcmFmdHkudmlld3BvcnQuaW5pdChbTnVtYmVyIHdpZHRoLCBOdW1iZXIgaGVpZ2h0LCBTdHJpbmcgc3RhZ2VfZWxlbV0pXG4gICAgICAgICAqIEBzaWduIHB1YmxpYyB2b2lkIENyYWZ0eS52aWV3cG9ydC5pbml0KFtOdW1iZXIgd2lkdGgsIE51bWJlciBoZWlnaHQsIEhUTUxFbGVtZW50IHN0YWdlX2VsZW1dKVxuICAgICAgICAgKiBAcGFyYW0gTnVtYmVyIHdpZHRoIC0gV2lkdGggb2YgdGhlIHZpZXdwb3J0XG4gICAgICAgICAqIEBwYXJhbSBOdW1iZXIgaGVpZ2h0IC0gSGVpZ2h0IG9mIHRoZSB2aWV3cG9ydFxuICAgICAgICAgKiBAcGFyYW0gU3RyaW5nIG9yIEhUTUxFbGVtZW50IHN0YWdlX2VsZW0gLSB0aGUgZWxlbWVudCB0byB1c2UgYXMgdGhlIHN0YWdlIChlaXRoZXIgaXRzIGlkIG9yIHRoZSBhY3R1YWwgZWxlbWVudCkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEluaXRpYWxpemUgdGhlIHZpZXdwb3J0LiBJZiB0aGUgYXJndW1lbnRzICd3aWR0aCcgb3IgJ2hlaWdodCcgYXJlIG1pc3NpbmcsIHVzZSBDcmFmdHkuRE9NLndpbmRvdy53aWR0aCBhbmQgQ3JhZnR5LkRPTS53aW5kb3cuaGVpZ2h0IChmdWxsIHNjcmVlbiBtb2RlbCkuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoZSBhcmd1bWVudCAnc3RhZ2VfZWxlbScgaXMgdXNlZCB0byBzcGVjaWZ5IGEgc3RhZ2UgZWxlbWVudCBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCBhbmQgY2FuIGJlIGVpdGhlciBhIHN0cmluZyBvciBhbiBIVE1MRWxlbWVudC4gIElmIGEgc3RyaW5nIGlzIHByb3ZpZGVkLCBpdCB3aWxsIGxvb2sgZm9yIGFuIGVsZW1lbnQgd2l0aCB0aGF0IGlkIGFuZCwgaWYgbm9uZSBleGlzdHMsIGNyZWF0ZSBhIGRpdi4gIElmIGFuIEhUTUxFbGVtZW50IGlzIHByb3ZpZGVkLCB0aGF0IGlzIHVzZWQgZGlyZWN0bHkuICBPbWl0dGluZyB0aGlzIGFyZ3VtZW50IGlzIHRoZSBzYW1lIGFzIHBhc3NpbmcgYW4gaWQgb2YgJ2NyLXN0YWdlJy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHNlZSBDcmFmdHkuZGV2aWNlLCBDcmFmdHkuRE9NLCBDcmFmdHkuc3RhZ2VcbiAgICAgICAgICovXG4gICAgICAgIGluaXQ6IGZ1bmN0aW9uICh3LCBoKSB7XG5cbiAgICAgICAgICAgIC8vIHNldHRlcnMrZ2V0dGVycyBmb3IgdGhlIHZpZXdwb3J0XG4gICAgICAgICAgICB0aGlzLl9kZWZpbmVWaWV3cG9ydFByb3BlcnRpZXMoKTtcbiAgICAgICAgICAgIC8vIElmIG5vIHdpZHRoIG9yIGhlaWdodCBpcyBkZWZpbmVkLCB0aGUgd2lkdGggYW5kIGhlaWdodCBpcyBzZXQgdG8gZnVsbHNjcmVlblxuICAgICAgICAgICAgdGhpcy5fd2lkdGggPSAoIXcpID8gQ3JhZnR5LkRPTS53aW5kb3cud2lkdGggOiB3O1xuICAgICAgICAgICAgdGhpcy5faGVpZ2h0ID0gKCFoKSA/IENyYWZ0eS5ET00ud2luZG93LmhlaWdodCA6IGg7XG5cblxuXG4gICAgICAgICAgICAvKipAXG4gICAgICAgICAgICAgKiAjQ3JhZnR5LnN0YWdlXG4gICAgICAgICAgICAgKiBAY2F0ZWdvcnkgQ29yZVxuICAgICAgICAgICAgICogVGhlIHN0YWdlIHdoZXJlIGFsbCB0aGUgRE9NIGVudGl0aWVzIHdpbGwgYmUgcGxhY2VkLlxuICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgIC8qKkBcbiAgICAgICAgICAgICAqICNDcmFmdHkuc3RhZ2UuZWxlbVxuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnN0YWdlXG4gICAgICAgICAgICAgKiBUaGUgYCNjci1zdGFnZWAgZGl2IGVsZW1lbnQuXG4gICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgLyoqQFxuICAgICAgICAgICAgICogI0NyYWZ0eS5zdGFnZS5pbm5lclxuICAgICAgICAgICAgICogQGNvbXAgQ3JhZnR5LnN0YWdlXG4gICAgICAgICAgICAgKiBgQ3JhZnR5LnN0YWdlLmlubmVyYCBpcyBhIGRpdiBpbnNpZGUgdGhlIGAjY3Itc3RhZ2VgIGRpdiB0aGF0IGhvbGRzIGFsbCBET00gZW50aXRpZXMuXG4gICAgICAgICAgICAgKiBJZiB5b3UgdXNlIGNhbnZhcywgYSBgY2FudmFzYCBlbGVtZW50IGlzIGNyZWF0ZWQgYXQgdGhlIHNhbWUgbGV2ZWwgaW4gdGhlIGRvbVxuICAgICAgICAgICAgICogYXMgdGhlIHRoZSBgQ3JhZnR5LnN0YWdlLmlubmVyYCBkaXYuIFNvIHRoZSBoaWVyYXJjaHkgaW4gdGhlIERPTSBpc1xuICAgICAgICAgICAgICogIFxuICAgICAgICAgICAgICogfn5+XG4gICAgICAgICAgICAgKiBDcmFmdHkuc3RhZ2UuZWxlbVxuICAgICAgICAgICAgICogIC0gQ3JhZnR5LnN0YWdlLmlubmVyIChhIGRpdiBIVE1MRWxlbWVudClcbiAgICAgICAgICAgICAqICAtIENyYWZ0eS5jYW52YXMuX2NhbnZhcyAoYSBjYW52YXMgSFRNTEVsZW1lbnQpXG4gICAgICAgICAgICAgKiB+fn5cbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgdmFyIGM7XG4gICAgICAgICAgICAgYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG4gICAgICAgICAgICAgYy53aWR0aCA9IENyYWZ0eS52aWV3cG9ydC53aWR0aDtcbiAgICAgICAgICAgICBjLmhlaWdodCA9IENyYWZ0eS52aWV3cG9ydC5oZWlnaHQ7XG5cbiAgICAgICAgICAgICBDcmFmdHkuY2FudmFzLl9jYW52YXMgPSBjO1xuICAgICAgICAgICAgIENyYWZ0eS5jYW52YXMuY29udGV4dCA9IGMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGMpO1xuXG4gICAgICAgICAgICAvL2NyZWF0ZSBzdGFnZSBkaXYgdG8gY29udGFpbiBldmVyeXRoaW5nXG4gICAgICAgICAgICBDcmFmdHkuc3RhZ2UgPSB7XG4gICAgICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgICAgICB5OiAwLFxuICAgICAgICAgICAgICAgIGZ1bGxzY3JlZW46IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVsZW06IGNcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vZnVsbHNjcmVlbiwgc3RvcCBzY3JvbGxiYXJzXG4gICAgICAgICAgICBpZiAoIXcgJiYgIWgpIHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcbiAgICAgICAgICAgICAgICBDcmFmdHkuc3RhZ2UuZnVsbHNjcmVlbiA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIENyYWZ0eS5hZGRFdmVudCh0aGlzLCB3aW5kb3csIFwicmVzaXplXCIsIENyYWZ0eS52aWV3cG9ydC5yZWxvYWQpO1xuXG4gICAgICAgICAgICAvLyBDcmFmdHkuYWRkRXZlbnQodGhpcywgd2luZG93LCBcImJsdXJcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gICAgIGlmIChDcmFmdHkuc2V0dGluZ3MuZ2V0KFwiYXV0b1BhdXNlXCIpKSB7XG4gICAgICAgICAgICAvLyAgICAgICAgIGlmICghQ3JhZnR5Ll9wYXVzZWQpIENyYWZ0eS5wYXVzZSgpO1xuICAgICAgICAgICAgLy8gICAgIH1cbiAgICAgICAgICAgIC8vIH0pO1xuICAgICAgICAgICAgLy8gQ3JhZnR5LmFkZEV2ZW50KHRoaXMsIHdpbmRvdywgXCJmb2N1c1wiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyAgICAgaWYgKENyYWZ0eS5fcGF1c2VkICYmIENyYWZ0eS5zZXR0aW5ncy5nZXQoXCJhdXRvUGF1c2VcIikpIHtcbiAgICAgICAgICAgIC8vICAgICAgICAgQ3JhZnR5LnBhdXNlKCk7XG4gICAgICAgICAgICAvLyAgICAgfVxuICAgICAgICAgICAgLy8gfSk7XG5cblxuICAgICAgICAgICAgQ3JhZnR5LnNldHRpbmdzLnJlZ2lzdGVyKFwiYXV0b1BhdXNlXCIsIGZ1bmN0aW9uICgpIHt9KTtcbiAgICAgICAgICAgIENyYWZ0eS5zZXR0aW5ncy5tb2RpZnkoXCJhdXRvUGF1c2VcIiwgZmFsc2UpO1xuXG5cbiAgICAgICAgICAgIC8vIENyYWZ0eS5zdGFnZS5lbGVtLmFwcGVuZENoaWxkKENyYWZ0eS5zdGFnZS5pbm5lcik7XG4gICAgICAgICAgICAvLyBDcmFmdHkuc3RhZ2UuaW5uZXIuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICAgICAgICAvLyBDcmFmdHkuc3RhZ2UuaW5uZXIuc3R5bGUuekluZGV4ID0gXCIxXCI7XG4gICAgICAgICAgICAvLyBDcmFmdHkuc3RhZ2UuaW5uZXIuc3R5bGUudHJhbnNmb3JtU3R5bGUgPSBcInByZXNlcnZlLTNkXCI7IC8vIFNlZW1zIG5lY2Vzc2FyeSBmb3IgRmlyZWZveCB0byBwcmVzZXJ2ZSB6SW5kZXhlcz9cblxuICAgICAgICAgICAgLy9jc3Mgc3R5bGVcbiAgICAgICAgICAgIC8vIGVsZW0ud2lkdGggPSB0aGlzLndpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgLy8gZWxlbS5oZWlnaHQgPSB0aGlzLmhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgIC8vIGVsZW0ub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG5cbiAgICAgICAgICAgIC8vIHJlc2l6ZSBldmVudHNcbiAgICAgICAgICAgIENyYWZ0eS5iaW5kKFwiVmlld3BvcnRSZXNpemVcIiwgZnVuY3Rpb24oKXtDcmFmdHkudHJpZ2dlcihcIkludmFsaWRhdGVWaWV3cG9ydFwiKTt9KTtcblxuICAgICAgICAgICAgaWYgKENyYWZ0eS5tb2JpbGUpIHtcblxuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBkZWZhdWx0IGdyYXkgaGlnaGxpZ2h0aW5nIGFmdGVyIHRvdWNoXG5cblxuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGVsZW0ucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG4gICAgICAgICAgICAgICAgLy8gLy9maW5kIG91dCB0aGUgb2Zmc2V0IHBvc2l0aW9uIG9mIHRoZSBzdGFnZVxuICAgICAgICAgICAgICAgIC8vIG9mZnNldCA9IENyYWZ0eS5ET00uaW5uZXIoQ3JhZnR5LnN0YWdlLmVsZW0pO1xuICAgICAgICAgICAgICAgIC8vIENyYWZ0eS5zdGFnZS54ID0gb2Zmc2V0Lng7XG4gICAgICAgICAgICAgICAgLy8gQ3JhZnR5LnN0YWdlLnkgPSBvZmZzZXQueTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgXG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gQ3JlYXRlIHNldHRlcnMvZ2V0dGVycyBmb3IgeCwgeSwgd2lkdGgsIGhlaWdodFxuICAgICAgICBfZGVmaW5lVmlld3BvcnRQcm9wZXJ0aWVzOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYgKENyYWZ0eS5zdXBwb3J0LnNldHRlcikge1xuICAgICAgICAgICAgICAgIC8vZGVmaW5lIGdldHRlcnMgYW5kIHNldHRlcnMgdG8gc2Nyb2xsIHRoZSB2aWV3cG9ydFxuICAgICAgICAgICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygneCcsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsKCdfeCcsIHYpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygneScsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsKCdfeScsIHYpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX19kZWZpbmVTZXR0ZXJfXygnd2lkdGgnLCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl93aWR0aCA9IHY7XG4gICAgICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiVmlld3BvcnRSZXNpemVcIik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fX2RlZmluZVNldHRlcl9fKCdoZWlnaHQnLCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9oZWlnaHQgPSB2O1xuICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlZpZXdwb3J0UmVzaXplXCIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX19kZWZpbmVHZXR0ZXJfXygneCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3g7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fX2RlZmluZUdldHRlcl9fKCd5JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5feTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9fZGVmaW5lR2V0dGVyX18oJ3dpZHRoJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fd2lkdGg7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fX2RlZmluZUdldHRlcl9fKCdoZWlnaHQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfSk7XG5cblxuXG4gICAgICAgICAgICAgICAgLy9JRTlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoQ3JhZnR5LnN1cHBvcnQuZGVmaW5lUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgJ3gnLCB7XG4gICAgICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2Nyb2xsKCdfeCcsIHYpO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl94O1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBjb25maWd1cmFibGUgOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICd5Jywge1xuICAgICAgICAgICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjcm9sbCgnX3knLCB2KTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5feTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgY29uZmlndXJhYmxlIDogdHJ1ZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnd2lkdGgnLCB7XG4gICAgICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3dpZHRoID0gdjtcbiAgICAgICAgICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiVmlld3BvcnRSZXNpemVcIik7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3dpZHRoO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBjb25maWd1cmFibGUgOiB0cnVlXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdoZWlnaHQnLCB7XG4gICAgICAgICAgICAgICAgICAgIHNldDogZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2hlaWdodCA9IHY7XG4gICAgICAgICAgICAgICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlZpZXdwb3J0UmVzaXplXCIpO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9oZWlnaHQ7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZSA6IHRydWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipAXG4gICAgICAgICAqICNDcmFmdHkudmlld3BvcnQucmVsb2FkXG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5zdGFnZVxuICAgICAgICAgKlxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgQ3JhZnR5LnZpZXdwb3J0LnJlbG9hZCgpXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlY2FsY3VsYXRlIGFuZCByZWxvYWQgc3RhZ2Ugd2lkdGgsIGhlaWdodCBhbmQgcG9zaXRpb24uXG4gICAgICAgICAqIFVzZWZ1bCB3aGVuIGJyb3dzZXIgcmV0dXJuIHdyb25nIHJlc3VsdHMgb24gaW5pdCAobGlrZSBzYWZhcmkgb24gSXBhZDIpLlxuICAgICAgICAgKlxuICAgICAgICAgKi9cbiAgICAgICAgcmVsb2FkOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBDcmFmdHkuRE9NLndpbmRvdy5pbml0KCk7XG4gICAgICAgICAgICB2YXIgdyA9IENyYWZ0eS5ET00ud2luZG93LndpZHRoLFxuICAgICAgICAgICAgICAgIGggPSBDcmFmdHkuRE9NLndpbmRvdy5oZWlnaHQsXG4gICAgICAgICAgICAgICAgb2Zmc2V0O1xuXG5cbiAgICAgICAgICAgIGlmIChDcmFmdHkuc3RhZ2UuZnVsbHNjcmVlbikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3dpZHRoID0gdztcbiAgICAgICAgICAgICAgICB0aGlzLl9oZWlnaHQgPSBoO1xuICAgICAgICAgICAgICAgIENyYWZ0eS50cmlnZ2VyKFwiVmlld3BvcnRSZXNpemVcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIG9mZnNldCA9IENyYWZ0eS5ET00uaW5uZXIoQ3JhZnR5LnN0YWdlLmVsZW0pO1xuICAgICAgICAgICAgLy8gQ3JhZnR5LnN0YWdlLnggPSBvZmZzZXQueDtcbiAgICAgICAgICAgIC8vIENyYWZ0eS5zdGFnZS55ID0gb2Zmc2V0Lnk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqQFxuICAgICAgICAgKiAjQ3JhZnR5LnZpZXdwb3J0LnJlc2V0XG4gICAgICAgICAqIEBjb21wIENyYWZ0eS5zdGFnZVxuICAgICAgICAgKiBAdHJpZ2dlciBTdG9wQ2FtZXJhIC0gY2FsbGVkIHRvIGNhbmNlbCBjYW1lcmEgYW5pbWF0aW9uc1xuICAgICAgICAgKlxuICAgICAgICAgKiBAc2lnbiBwdWJsaWMgQ3JhZnR5LnZpZXdwb3J0LnJlc2V0KClcbiAgICAgICAgICpcbiAgICAgICAgICogUmVzZXRzIHRoZSB2aWV3cG9ydCB0byBzdGFydGluZyB2YWx1ZXMsIGFuZCBjYW5jZWxzIGFueSBleGlzdGluZyBjYW1lcmEgYW5pbWF0aW9ucy5cbiAgICAgICAgICogQ2FsbGVkIHdoZW4gc2NlbmUoKSBpcyBydW4uXG4gICAgICAgICAqL1xuICAgICAgICByZXNldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgQ3JhZnR5LnZpZXdwb3J0Lm1vdXNlbG9vayhcInN0b3BcIik7XG4gICAgICAgICAgICBDcmFmdHkudHJpZ2dlcihcIlN0b3BDYW1lcmFcIik7XG4gICAgICAgICAgICBDcmFmdHkudmlld3BvcnQuc2NhbGUoMSk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcbiJdfQ==
;