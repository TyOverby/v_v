class NotComputed {
    constructor(property) {
        this.property = property;
    }
}

class Cant_set extends Error {
    constructor(property) {
        super(`Can't set properties (${property}) inside function`);
        this.property = property;
    }
}

function World(starting) {
    if (!starting) {
        starting = {};
    }

    let dirty = [];
    let state = {};

    let i_depend_on   = new Map();
    let depends_on_me = new Map();

    let name_to_functions = new Map();
    let functions_to_name = new Map();

    function mark_dirty(d) {
        dirty.push(d);
    }

    let evaluating_function = null;

    function check_for_cycles(looking_for, at, seen, path) {
        path.push(at);
        seen.add(at);
        if (seen.has(looking_for)) { 
            throw new Error(`cycle detected! ${path}`); 
        }

        for (let d of (i_depend_on.get(at) || [])) {
            check_for_cycles(looking_for, d, seen, path);
        }
        path.pop();
    }

    function stabilize() {
        while (dirty.length !== 0)  {
            let d = dirty.pop();
            let recomputed = true;
            if (name_to_functions.has(d)) {
                let f = name_to_functions.get(d);
                try {
                    evaluating_function = f;
                    let my_state = state_for_computing(f);
                    let output = f.call(my_state, my_state);
                    if (output === state[d]) {
                        recomputed = false;
                    } else {
                        state[d] = output;
                    }
                } catch (e) {
                    if (e instanceof NotComputed) {
                        add_dep(e.property, d);
                        mark_dirty(d);
                    } else { 
                        throw e; 
                    }
                } finally {
                    evaluating_function = null;
                }
            }

            if (recomputed) {
                for (let dep of (depends_on_me.get(d) || [])) {
                    mark_dirty(dep);
                }
            }
        }
    }

    function register(name, f) {
        name_to_functions.set(name, f);
        functions_to_name.set(f, name);
        mark_dirty(name);
    }

    function add_dep(dependency, dependent) {
        check_for_cycles(dependent, dependency, new Set(), [dependent]);

        if (!i_depend_on.has(dependent)){
            i_depend_on.set(dependent, new Set());
        } 
        i_depend_on.get(dependent).add(dependency);

        if (!depends_on_me.has(dependency)){
            depends_on_me.set(dependency, new Set());
        }
        depends_on_me.get(dependency).add(dependent);
    }

    function state_for_computing(f) {
        let my_name = functions_to_name.get(f);
        return new Proxy(state, {
            get(target, property) {
                if (!i_depend_on.has(my_name) || !i_depend_on.get(my_name).has(property)) {
                    throw new NotComputed(property);
                }
                return target[property];
            },
            set(_target, property, _value) {
                throw new Cant_set(property);
            }
        }); 
    }


    let to_return =  new Proxy(state, {
        get (target, property) {
            if (evaluating_function) {
                return state_for_computing(evaluating_function)[property];
            } else {
                stabilize();
                return target[property];
            }
        },
        set(target, property, value) {
            if (evaluating_function) { 
                state_for_computing(evaluating_function)[property] = value;
                return true;
            }

            if (target[property] === value) {
                return true;
            } 
            if (value instanceof Function) {
                register(property, value);
            } else {
                target[property] = value;
                mark_dirty(property);
            }
            return true;
        }
    });

    return Object.assign(to_return, starting);
}

var log = console.log;

// A world stores inputs, and dependency info
// for the set of computations.
var world = new World();

// inputs are assigned into the world
world.a = 5;
world.b = 10;
log(world.a, world.b); // 5 10

// function assignment adds a "computed value"
world.c = ({a, b}) => a + b;
world.d = ({a, b, c}) => a + b + c;
log(world.c, world.d); // 15 30

// re-assigning inputs will re-compute dependents
world.a = 20;
log(world.d); // 60

// world state can be requested
log(world); // { a: 20, b: 10, c: 30, d: 60 }

/*
var world = new World({
    foo : 5,
    bar : 10, 
    baz : () => world.foo + world.bar,
    bux : ({foo, bar}) => foo - bar,
    buz () {
        return (this.bux < 1) ? this.bar : this.foo;
    },
    buy ({foo, bar}) { return foo - bar; },
    bix (world) { with(world) {return foo - bar;} }
});

console.log(world.baz);

world.foo = 20;
console.log(world.baz);

with (world) {
    foo = 30;
}
console.log(world.baz);

console.log(world);
*/