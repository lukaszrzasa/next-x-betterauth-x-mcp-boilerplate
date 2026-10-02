import { afterEach, expect, mock, test } from "bun:test";
import { installDom } from "../helpers/dom";

installDom();

const React = await import("react");
const { render: baseRender, fireEvent, screen, cleanup, within } = await import("@testing-library/react");
const { withIntl } = await import("../helpers/intl.jsx");
const { DataTable } = await import("../../src/components/data-table/DataTable");
const { DataTableColumnHeader } = await import("../../src/components/data-table/DataTableColumnHeader");
const { pageRange } = await import("../../src/components/data-table/DataTablePagination");
/** Every tree renders inside the English catalog, as the root layout provides it. */
const render = (ui, options) => baseRender(ui, { wrapper: withIntl(), ...options });

const rows = [
  { id: "1", name: "Ada", score: 3 },
  { id: "2", name: "Grace", score: 1 },
];
const columns = [
  {
    id: "name",
    accessorKey: "name",
    enableSorting: true,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.name,
  },
  { id: "score", accessorKey: "score", enableSorting: false, header: "Score", cell: ({ row }) => row.original.score },
];

function Harness(props) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowCount={57}
      pagination={{ pageIndex: 1, pageSize: 25 }}
      sorting={{ id: "name", desc: false }}
      onPaginationChange={() => {}}
      onSortingChange={() => {}}
      emptyState="Nothing here"
      caption="Test rows"
      itemLabel="things"
      {...props}
    />
  );
}

afterEach(cleanup);

test("renders semantic table markup with the server page as-is, in the given order", () => {
  render(<Harness />);
  const table = screen.getByRole("table");
  expect(within(table).getByText("Test rows").tagName).toBe("CAPTION");
  const headers = within(table).getAllByRole("columnheader");
  expect(headers).toHaveLength(2);
  expect(headers[0].getAttribute("aria-sort")).toBe("ascending");
  expect(headers[1].getAttribute("aria-sort")).toBeNull();
  const cells = within(table).getAllByRole("cell").map((cell) => cell.textContent);
  // Rows are shown as received: the descending score is not re-sorted client-side.
  expect(cells).toEqual(["Ada", "3", "Grace", "1"]);
});

test("sort buttons are labelled with their effect and toggle between two states only", () => {
  const onSortingChange = mock();
  const view = render(<Harness onSortingChange={onSortingChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Sort by Name, descending" }));
  expect(onSortingChange).toHaveBeenLastCalledWith({ id: "name", desc: true });
  view.rerender(<Harness onSortingChange={onSortingChange} sorting={{ id: "name", desc: true }} />);
  expect(screen.getAllByRole("columnheader")[0].getAttribute("aria-sort")).toBe("descending");
  fireEvent.click(screen.getByRole("button", { name: "Sort by Name, ascending" }));
  expect(onSortingChange).toHaveBeenLastCalledWith({ id: "name", desc: false });
  // A non-sortable column offers no button.
  expect(screen.queryByRole("button", { name: /Sort by Score/ })).toBeNull();
});

test("pagination reports the range, the page and moves in 0-based table state", () => {
  const onPaginationChange = mock();
  render(<Harness onPaginationChange={onPaginationChange} />);
  expect(screen.getByText("26–50 of 57 things")).toBeTruthy();
  expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(onPaginationChange).toHaveBeenLastCalledWith({ pageIndex: 2, pageSize: 25 });
  fireEvent.click(screen.getByRole("button", { name: "First page" }));
  expect(onPaginationChange).toHaveBeenLastCalledWith({ pageIndex: 0, pageSize: 25 });
  fireEvent.click(screen.getByRole("button", { name: "Last page" }));
  expect(onPaginationChange).toHaveBeenLastCalledWith({ pageIndex: 2, pageSize: 25 });
  fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
  expect(onPaginationChange).toHaveBeenLastCalledWith({ pageIndex: 0, pageSize: 50 });
});

test("boundary controls disable at the ends and everything pauses while pending", () => {
  const view = render(<Harness pagination={{ pageIndex: 0, pageSize: 25 }} />);
  expect(screen.getByRole("button", { name: "Previous page" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(false);
  view.rerender(<Harness pagination={{ pageIndex: 2, pageSize: 25 }} />);
  expect(screen.getByRole("button", { name: "Next page" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Last page" }).disabled).toBe(true);
  view.rerender(<Harness pagination={{ pageIndex: 1, pageSize: 25 }} pending />);
  for (const name of ["First page", "Previous page", "Next page", "Last page"])
    expect(screen.getByRole("button", { name }).disabled).toBe(true);
  expect(screen.getByLabelText("Rows per page").disabled).toBe(true);
  expect(document.querySelector("[data-slot=data-table]").getAttribute("aria-busy")).toBe("true");
});

test("an empty page shows the empty state and a plain zero count", () => {
  render(<Harness data={[]} rowCount={0} pagination={{ pageIndex: 0, pageSize: 25 }} />);
  expect(screen.getByText("Nothing here")).toBeTruthy();
  expect(screen.getByText("0 things")).toBeTruthy();
  expect(screen.queryByText(/1–0/)).toBeNull();
  expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  expect(pageRange({ pageIndex: 0, pageSize: 10 }, 0)).toBeNull();
  expect(pageRange({ pageIndex: 0, pageSize: 10 }, 1)).toEqual({ first: 1, last: 1 });
  expect(pageRange({ pageIndex: 3, pageSize: 10 }, 1234)).toEqual({ first: 31, last: 40 });
});

test("the range formats its total in the viewer's language", () => {
  const view = render(<Harness rowCount={1234} pagination={{ pageIndex: 3, pageSize: 10 }} />);
  expect(screen.getByText("31–40 of 1,234 things")).toBeTruthy();
  view.unmount();
  baseRender(<Harness rowCount={1234} pagination={{ pageIndex: 3, pageSize: 10 }} itemLabel="wierszy" />, {
    wrapper: withIntl("pl"),
  });
  expect(screen.getByText("31–40 z 1234 (wierszy)")).toBeTruthy();
});
