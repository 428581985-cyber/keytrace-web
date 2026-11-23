import { test } from "node:test";
import { Reader, Writer } from "@keybr/binary";
import { Layout } from "@keybr/keyboard";
import { Result, TextType } from "@keybr/result";
import { Histogram } from "@keybr/textinput";
import { deepEqual, equal } from "rich-assert";
import { readResult, writeResult } from "./binary.ts";

test("write and read", () => {
  // Arrange.

  const histogram = new Histogram([
    { codePoint: 0x0061, hitCount: 11, missCount: 1, timeToType: 111 },
    { codePoint: 0x0062, hitCount: 22, missCount: 2, timeToType: 222 },
    { codePoint: 0x0063, hitCount: 33, missCount: 3, timeToType: 333 },
  ]);

  const result = new Result(
    /* layout= */ Layout.EN_US,
    /* textType= */ TextType.GENERATED,
    /* timeStamp= */ Date.parse("2001-02-03T03:05:06.123Z"),
    /* length= */ 123,
    /* time= */ 12345,
    /* errors= */ 3,
    /* histogram= */ histogram,
  );

  const expected = new Result(
    /* layout= */ Layout.EN_US,
    /* textType= */ TextType.GENERATED,
    /* timeStamp= */ Date.parse("2001-02-03T03:05:06Z"),
    /* length= */ 123,
    /* time= */ 12345,
    /* errors= */ 3,
    /* histogram= */ histogram,
  );

  // Write.

  const writer = new Writer();

  writeResult(writer, result);
  writeResult(writer, result);
  writeResult(writer, result);

  const buffer = writer.buffer();

  equal(buffer.byteLength, 75);

  // Read.

  const reader = new Reader(buffer);

  equal(reader.remaining(), 75);
  deepEqual(readResult(reader), expected);
  equal(reader.remaining(), 50);
  deepEqual(readResult(reader), expected);
  equal(reader.remaining(), 25);
  deepEqual(readResult(reader), expected);
  equal(reader.remaining(), 0);
});

test("write and read zh-qp, zh-sp, and en-us layouts", () => {
  const histogram = new Histogram([
    { codePoint: 0x0076, hitCount: 8, missCount: 1, timeToType: 145 },
    { codePoint: 0x0069, hitCount: 30, missCount: 0, timeToType: 95 },
  ]);

  const layouts = [Layout.ZH_QP, Layout.ZH_SP, Layout.EN_US];
  equal(Layout.ZH_QP.xid, 0xfd);
  equal(Layout.ZH_SP.xid, 0xfe);
  equal(Layout.EN_US.xid, 0x10);

  const writer = new Writer();
  const timeStamp = Date.parse("2026-11-23T08:00:00Z");
  const written = layouts.map(
    (layout, index) =>
      new Result(
        /* layout= */ layout,
        /* textType= */ TextType.GENERATED,
        /* timeStamp= */ timeStamp + index * 1000,
        /* length= */ 80 + index,
        /* time= */ 12000 + index * 100,
        /* errors= */ index,
        /* histogram= */ histogram,
      ),
  );

  for (const item of written) {
    writeResult(writer, item);
  }

  const reader = new Reader(writer.buffer());
  for (const expected of written) {
    const decoded = readResult(reader);
    equal(decoded.layout, expected.layout);
    equal(decoded.layout.xid, expected.layout.xid);
    deepEqual(decoded, expected);
  }
  equal(reader.remaining(), 0);
});
