// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MissionRequestForm } from "./MissionRequestForm";
import { SettingsProvider } from "../../settings/SettingsContext";
const {createMission}=vi.hoisted(()=>({createMission:vi.fn()}));
vi.mock("../../operations/OperationsContext",()=>({useOperations:()=>({seats:[{seat_id:"seat-12",label:"12",mission_supported:true}],robots:[],createMission,isCreatingMission:false,isLoading:false,error:null})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("retries a lost response with the same key and prevents duplicate submissions",async()=>{
 let reject!: (e:Error)=>void;
 createMission.mockImplementationOnce(()=>new Promise((_,no)=>{reject=no;})).mockResolvedValueOnce({mission_id:"registered"});
 const onCreated=vi.fn();
 render(<SettingsProvider><MissionRequestForm onClose={vi.fn()} onCreated={onCreated}/></SettingsProvider>);
 fireEvent.change(screen.getByLabelText("작업 좌석"),{target:{value:"seat-12"}});
 const button=screen.getByRole("button",{name:"요청 보내기"});fireEvent.click(button);fireEvent.click(button);
 expect(createMission).toHaveBeenCalledTimes(1);expect(screen.getByRole("button",{name:"닫기"})).toBeDisabled();
 const first=createMission.mock.calls[0][0];
 await act(async()=>reject(new Error("연결 끊김")));
 expect(screen.getByRole("alert")).toHaveTextContent("연결 끊김");
 fireEvent.click(screen.getByRole("button",{name:"요청 보내기"}));await act(async()=>{});
 expect(createMission.mock.calls[1][0]).toEqual(first);expect(onCreated).toHaveBeenCalledTimes(1);
});
